package api

import (
	"context"
	"net/http"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

const objectIndexRepairEnqueueTimeout = 5 * time.Second

type uploadCommitFinalizeService struct {
	server *server
}

func newUploadCommitFinalizeService(s *server) uploadCommitFinalizeService {
	return uploadCommitFinalizeService{server: s}
}

func (svc uploadCommitFinalizeService) finalizeImmediate(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	payload map[string]any,
	progress *models.JobProgress,
	indexEntries []store.ObjectIndexEntry,
) (models.Job, *uploadHTTPError) {
	job, now, uploadErr := svc.persistImmediateJobResult(ctx, profileID, payload, progress)
	if uploadErr != nil {
		return models.Job{}, uploadErr
	}

	if len(indexEntries) > 0 {
		if err := svc.server.store.UpsertObjectIndexBatch(ctx, profileID, us.Bucket, indexEntries, now); err != nil {
			logging.ErrorFields("upload object index update failed", map[string]any{
				"event":      "upload.object_index_update_failed",
				"profile_id": profileID,
				"upload_id":  uploadID,
				"bucket":     us.Bucket,
				"error":      err.Error(),
			})
			repairCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), objectIndexRepairEnqueueTimeout)
			svc.enqueueObjectIndexRepair(repairCtx, profileID, us.Bucket, us.Prefix)
			cancel()
		}
	}

	svc.server.cleanupImmediateUploadCommitState(ctx, profileID, uploadID)
	svc.publishImmediateCommitCompleted(job.ID, progress)

	return job, nil
}

func (svc uploadCommitFinalizeService) enqueueObjectIndexRepair(ctx context.Context, profileID, bucket, prefix string) {
	if svc.server.jobs == nil {
		logging.ErrorFields("upload object index repair unavailable", map[string]any{
			"event":      "upload.object_index_repair_unavailable",
			"profile_id": profileID,
			"bucket":     bucket,
		})
		return
	}

	job, err := svc.server.store.CreateJob(ctx, profileID, store.CreateJobInput{
		Type: jobs.JobTypeS3IndexObjects,
		Payload: map[string]any{
			"bucket":      bucket,
			"prefix":      prefix,
			"fullReindex": true,
			"reason":      "upload_object_index_repair",
		},
	})
	if err != nil {
		logging.ErrorFields("upload object index repair job creation failed", map[string]any{
			"event":      "upload.object_index_repair_create_failed",
			"profile_id": profileID,
			"bucket":     bucket,
			"error":      err.Error(),
		})
		return
	}

	if err := svc.server.jobs.Enqueue(job.ID); err != nil {
		rollbackErr := svc.server.rollbackCreatedJobAfterEnqueueFailure(ctx, profileID, job, err)
		logging.ErrorFields("upload object index repair job enqueue failed", map[string]any{
			"event":      "upload.object_index_repair_enqueue_failed",
			"profile_id": profileID,
			"bucket":     bucket,
			"job_id":     job.ID,
			"error":      err.Error(),
		})
		if rollbackErr != nil {
			logging.ErrorFields("upload object index repair job rollback failed", map[string]any{
				"event":         "upload.object_index_repair_rollback_failed",
				"profile_id":    profileID,
				"bucket":        bucket,
				"job_id":        job.ID,
				"enqueue_error": err.Error(),
				"error":         rollbackErr.Error(),
			})
		}
		return
	}

	logging.WarnFields("upload object index repair queued", map[string]any{
		"event":      "upload.object_index_repair_queued",
		"profile_id": profileID,
		"bucket":     bucket,
		"job_id":     job.ID,
	})
}

func (svc uploadCommitFinalizeService) persistImmediateJobResult(
	ctx context.Context,
	profileID string,
	payload map[string]any,
	progress *models.JobProgress,
) (models.Job, string, *uploadHTTPError) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	job, err := svc.server.store.CreateJob(ctx, profileID, store.CreateJobInput{
		Type:       jobs.JobTypeTransferDirectUpload,
		Payload:    payload,
		Status:     models.JobStatusSucceeded,
		StartedAt:  &now,
		FinishedAt: &now,
		Progress:   progress,
	})
	if err != nil {
		return models.Job{}, "", &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to create job",
		}
	}

	updated, ok, err := svc.server.store.GetJob(ctx, profileID, job.ID)
	if err != nil || !ok {
		return models.Job{}, "", &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to reload finalized job",
		}
	}
	return updated, now, nil
}

func (svc uploadCommitFinalizeService) publishImmediateCommitCompleted(jobID string, progress *models.JobProgress) {
	eventPayload := map[string]any{"status": models.JobStatusSucceeded}
	if progress != nil {
		eventPayload["progress"] = progress
	}
	svc.server.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: eventPayload})
}

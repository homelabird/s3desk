package api

import (
	"context"
	"net/http"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

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
		_ = svc.server.store.UpsertObjectIndexBatch(ctx, profileID, us.Bucket, indexEntries, now)
	}

	svc.server.cleanupImmediateUploadCommitState(ctx, profileID, uploadID)
	svc.publishImmediateCommitCompleted(job.ID, progress)

	return job, nil
}

func (svc uploadCommitFinalizeService) persistImmediateJobResult(
	ctx context.Context,
	profileID string,
	payload map[string]any,
	progress *models.JobProgress,
) (models.Job, string, *uploadHTTPError) {
	job, err := svc.server.store.CreateJob(ctx, profileID, store.CreateJobInput{
		Type:    jobs.JobTypeTransferDirectUpload,
		Payload: payload,
	})
	if err != nil {
		return models.Job{}, "", &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to create job",
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := svc.server.store.UpdateJobStatus(ctx, job.ID, models.JobStatusSucceeded, &now, &now, progress, nil, nil); err != nil {
		return models.Job{}, "", &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to finalize job",
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

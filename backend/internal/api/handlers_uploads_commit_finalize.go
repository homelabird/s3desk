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

func (s *server) finalizeImmediateUploadCommit(ctx context.Context, profileID, uploadID string, us store.UploadSession, payload map[string]any, progress *models.JobProgress, indexEntries []store.ObjectIndexEntry) (models.Job, *uploadHTTPError) {
	job, err := s.store.CreateJob(ctx, profileID, store.CreateJobInput{
		Type:    jobs.JobTypeTransferDirectUpload,
		Payload: payload,
	})
	if err != nil {
		return models.Job{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to create job",
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := s.store.UpdateJobStatus(ctx, job.ID, models.JobStatusSucceeded, &now, &now, progress, nil, nil); err != nil {
		return models.Job{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to finalize job",
		}
	}
	if len(indexEntries) > 0 {
		_ = s.store.UpsertObjectIndexBatch(ctx, profileID, us.Bucket, indexEntries, now)
	}

	_ = s.store.DeleteMultipartUploadsBySession(ctx, profileID, uploadID)
	_ = s.store.DeleteUploadObjectsBySession(ctx, profileID, uploadID)
	_, _ = s.store.DeleteUploadSession(ctx, profileID, uploadID)

	eventPayload := map[string]any{"status": models.JobStatusSucceeded}
	if progress != nil {
		eventPayload["progress"] = progress
	}
	s.cleanupImmediateUploadCommitState(ctx, profileID, uploadID)
	s.hub.Publish(ws.Event{Type: "job.completed", JobID: job.ID, Payload: eventPayload})
	return job, nil
}

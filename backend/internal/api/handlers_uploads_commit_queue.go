package api

import (
	"context"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func (s *server) enqueueStagingUploadCommit(
	ctx context.Context,
	profileID string,
	payload map[string]any,
) (models.Job, error) {
	job, err := s.store.CreateJob(ctx, profileID, store.CreateJobInput{
		Type:    jobs.JobTypeTransferSyncStagingToS3,
		Payload: payload,
	})
	if err != nil {
		return models.Job{}, err
	}

	if err := s.jobs.Enqueue(job.ID); err != nil {
		_, _ = s.store.DeleteJob(ctx, profileID, job.ID)
		return models.Job{}, err
	}

	s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})
	return job, nil
}

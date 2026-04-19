package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

type uploadCommitExecutionService struct {
	server *server
}

func newUploadCommitExecutionService(s *server) uploadCommitExecutionService {
	return uploadCommitExecutionService{server: s}
}

func (svc uploadCommitExecutionService) execute(
	ctx context.Context,
	session uploadCommitSession,
	req uploadCommitRequest,
) (models.JobCreatedResponse, *uploadHTTPError) {
	switch session.mode {
	case uploadModePresigned:
		return svc.server.executePresignedUploadCommit(ctx, session.profileID, session.uploadID, session.us, req)
	case uploadModeDirect:
		return svc.server.executeDirectUploadCommit(ctx, session.profileID, session.uploadID, session.us, req)
	default:
		return svc.executeStaging(ctx, session.profileID, buildStagingUploadCommitPayload(session, req))
	}
}

func (svc uploadCommitExecutionService) executeStaging(
	ctx context.Context,
	profileID string,
	payload map[string]any,
) (models.JobCreatedResponse, *uploadHTTPError) {
	if _, _, err := jobs.EnsureRcloneCompatible(ctx); err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "transfer_engine_missing",
			message: "rclone is required to commit an upload (install it or set RCLONE_PATH)",
		}
	}

	job, queueErr := svc.server.enqueueStagingUploadCommit(ctx, profileID, payload)
	if queueErr != nil {
		if errors.Is(queueErr, jobs.ErrJobQueueFull) {
			stats := svc.server.jobs.QueueStats()
			return models.JobCreatedResponse{}, &uploadHTTPError{
				status:  http.StatusTooManyRequests,
				code:    "job_queue_full",
				message: "job queue is full; try again later",
				details: map[string]any{"queueDepth": stats.Depth, "queueCapacity": stats.Capacity},
			}
		}
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to enqueue job",
		}
	}

	return models.JobCreatedResponse{JobID: job.ID}, nil
}

func (svc uploadCommitExecutionService) executeImmediate(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	client *s3.Client,
	multipartUploads []store.MultipartUpload,
) (models.JobCreatedResponse, *uploadHTTPError) {
	artifacts, uploadErr := svc.server.prepareImmediateUploadCommit(ctx, profileID, uploadID, us, req, client, multipartUploads)
	if uploadErr != nil {
		return models.JobCreatedResponse{}, uploadErr
	}

	job, uploadErr := svc.server.finalizeImmediateUploadCommit(ctx, profileID, uploadID, us, artifacts.payload, artifacts.progress, artifacts.indexEntries)
	if uploadErr != nil {
		return models.JobCreatedResponse{}, uploadErr
	}

	return models.JobCreatedResponse{JobID: job.ID}, nil
}

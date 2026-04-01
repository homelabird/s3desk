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

type uploadCommitSession struct {
	profileID string
	uploadID  string
	us        store.UploadSession
	mode      string
}

func (s *server) loadUploadCommitSession(r *http.Request) (uploadCommitSession, *uploadHTTPError) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := uploadIDFromRequest(r)
	if profileID == "" || uploadID == "" {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "profile and uploadId are required",
		}
	}

	us, ok, err := s.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load upload session",
		}
	}
	if !ok {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "upload session not found",
			details: map[string]any{"uploadId": uploadID},
		}
	}

	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode == uploadModeDirect && !s.cfg.UploadDirectStream {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "not_supported",
			message: "direct streaming uploads are disabled",
		}
	}

	return uploadCommitSession{
		profileID: profileID,
		uploadID:  uploadID,
		us:        us,
		mode:      mode,
	}, nil
}

func decodeUploadCommitRequest(r *http.Request) (uploadCommitRequest, error) {
	var req uploadCommitRequest
	if err := decodeJSONWithOptions(r, &req, jsonDecodeOptions{
		maxBytes:   uploadCommitJSONRequestBodyMaxBytes,
		allowEmpty: true,
	}); err != nil {
		return uploadCommitRequest{}, err
	}
	return req, nil
}

func (s *server) handleStagingUploadCommit(w http.ResponseWriter, r *http.Request, profileID string, payload map[string]any) {
	if _, _, err := jobs.EnsureRcloneCompatible(r.Context()); err != nil {
		writeError(w, http.StatusBadRequest, "transfer_engine_missing", "rclone is required to commit an upload (install it or set RCLONE_PATH)", nil)
		return
	}

	job, queueErr := s.enqueueStagingUploadCommit(r.Context(), profileID, payload)
	if queueErr != nil {
		if errors.Is(queueErr, jobs.ErrJobQueueFull) {
			stats := s.jobs.QueueStats()
			w.Header().Set("Retry-After", "2")
			writeError(
				w,
				http.StatusTooManyRequests,
				"job_queue_full",
				"job queue is full; try again later",
				map[string]any{"queueDepth": stats.Depth, "queueCapacity": stats.Capacity},
			)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to enqueue job", nil)
		return
	}

	writeJSON(w, http.StatusCreated, models.JobCreatedResponse{JobID: job.ID})
}

func (s *server) writeImmediateUploadCommitResponse(
	w http.ResponseWriter,
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	client *s3.Client,
	multipartUploads []store.MultipartUpload,
) {
	artifacts, uploadErr := s.prepareImmediateUploadCommit(ctx, profileID, uploadID, us, req, client, multipartUploads)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}

	job, uploadErr := s.finalizeImmediateUploadCommit(ctx, profileID, uploadID, us, artifacts.payload, artifacts.progress, artifacts.indexEntries)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}

	writeJSON(w, http.StatusCreated, models.JobCreatedResponse{JobID: job.ID})
}

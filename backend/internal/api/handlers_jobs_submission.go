package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"s3desk/internal/jobs"
	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

type jobSubmissionValidationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type jobSubmissionPreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type jobSubmissionRequest struct {
	Type    string
	Payload map[string]any
}

type jobSubmissionFailureOptions struct {
	ProfileID       string
	JobType         string
	JobID           string
	InternalMessage string
}

type jobSubmissionSuccessOptions struct {
	ProfileID        string
	JobType          string
	LogQueued        bool
	IncrementRetried bool
}

type jobSubmissionHTTPService struct {
	server *server
}

const jobEnqueueRollbackTimeout = 5 * time.Second

type jobSubmissionPreparedRequest struct {
	profileID      string
	submission     jobSubmissionRequest
	successOptions jobSubmissionSuccessOptions
	failureOptions jobSubmissionFailureOptions
	err            error
}

func (e *jobSubmissionValidationError) Error() string {
	return e.message
}

func (e *jobSubmissionPreparationError) Error() string {
	return e.message
}

func newJobSubmissionValidationError(status int, code, message string, details map[string]any) *jobSubmissionValidationError {
	return &jobSubmissionValidationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func newJobSubmissionPreparationError(status int, code, message string, details map[string]any) *jobSubmissionPreparationError {
	return &jobSubmissionPreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func writeJobSubmissionError(w http.ResponseWriter, err error) bool {
	var validationErr *jobSubmissionValidationError
	if !errors.As(err, &validationErr) {
		return false
	}
	writeError(w, validationErr.status, validationErr.code, validationErr.message, validationErr.details)
	return true
}

func writeJobSubmissionPreparationError(w http.ResponseWriter, err error) bool {
	var prepErr *jobSubmissionPreparationError
	if !errors.As(err, &prepErr) {
		return false
	}
	writeError(w, prepErr.status, prepErr.code, prepErr.message, prepErr.details)
	return true
}

func writeJobSubmissionPreparationFailure(w http.ResponseWriter, err error) bool {
	return writeJobSubmissionPreparationError(w, err) || writeJobSubmissionError(w, err)
}

func writeJobSubmissionFailure(
	w http.ResponseWriter,
	err error,
	stats *jobs.QueueStats,
	options jobSubmissionFailureOptions,
) bool {
	if writeJobSubmissionError(w, err) {
		return true
	}
	if errors.Is(err, jobs.ErrJobQueueFull) && stats != nil {
		logging.ErrorFields("job queue full", map[string]any{
			"event":          "job.queue_full",
			"job_id":         options.JobID,
			"job_type":       options.JobType,
			"profile_id":     options.ProfileID,
			"queue_depth":    stats.Depth,
			"queue_capacity": stats.Capacity,
		})
		w.Header().Set("Retry-After", "2")
		writeError(
			w,
			http.StatusTooManyRequests,
			"job_queue_full",
			"job queue is full; try again later",
			map[string]any{"queueDepth": stats.Depth, "queueCapacity": stats.Capacity},
		)
		return true
	}

	message := options.InternalMessage
	if message == "" {
		message = "failed to enqueue job"
	}
	writeError(w, http.StatusInternalServerError, "internal_error", message, nil)
	return true
}

func normalizeJobSubmissionPayload(payload map[string]any) map[string]any {
	if payload == nil {
		return map[string]any{}
	}
	return payload
}

func buildCreateJobSubmission(req models.JobCreateRequest) jobSubmissionRequest {
	return jobSubmissionRequest{
		Type:    req.Type,
		Payload: normalizeJobSubmissionPayload(req.Payload),
	}
}

func decodeCreateJobSubmissionRequest(r *http.Request) (jobSubmissionRequest, error) {
	var req models.JobCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		return jobSubmissionRequest{}, newJobSubmissionPreparationError(
			http.StatusBadRequest,
			"invalid_json",
			"invalid request body",
			map[string]any{"error": err.Error()},
		)
	}
	return buildCreateJobSubmission(req), nil
}

func requireJobSubmissionProfileID(r *http.Request) (string, error) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		return "", newJobSubmissionPreparationError(
			http.StatusBadRequest,
			"missing_profile",
			"X-Profile-Id header is required",
			nil,
		)
	}
	return profileID, nil
}

func requireRetryJobSubmissionRequest(r *http.Request) (string, string, error) {
	profileID, err := requireJobSubmissionProfileID(r)
	if err != nil {
		return "", "", err
	}
	jobID := chi.URLParam(r, "jobId")
	if jobID == "" {
		return "", "", newJobSubmissionPreparationError(
			http.StatusBadRequest,
			"invalid_request",
			"profile and jobId are required",
			nil,
		)
	}
	return profileID, jobID, nil
}

func buildRetryJobSubmission(job models.Job) (jobSubmissionRequest, error) {
	switch job.Status {
	case models.JobStatusFailed, models.JobStatusCanceled:
		return jobSubmissionRequest{
			Type:    job.Type,
			Payload: normalizeJobSubmissionPayload(job.Payload),
		}, nil
	default:
		return jobSubmissionRequest{}, newJobSubmissionValidationError(
			http.StatusBadRequest,
			"invalid_request",
			"job is not retryable (only failed/canceled)",
			map[string]any{"status": job.Status},
		)
	}
}

func (s *server) validateRunnableJobRequest(ctx context.Context, jobType string, payload map[string]any) error {
	if jobType == "" {
		return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", "type is required", nil)
	}
	if !s.jobs.IsSupportedJobType(jobType) {
		return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", "unsupported job type", map[string]any{"type": jobType})
	}

	switch jobType {
	case jobs.JobTypeTransferSyncLocalToS3:
		if err := validateTransferSyncLocalToS3Payload(payload, s.cfg.AllowedLocalDirs); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeTransferSyncS3ToLocal:
		if err := validateTransferSyncS3ToLocalPayload(payload, s.cfg.AllowedLocalDirs); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeTransferSyncStagingToS3:
		if err := validateTransferSyncStagingToS3Payload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeTransferDeletePrefix:
		if err := validateTransferDeletePrefixPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeS3ZipPrefix:
		if err := validateS3ZipPrefixPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeS3ZipObjects:
		if err := validateS3ZipObjectsPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeS3DeleteObjects:
		if err := validateS3DeleteObjectsPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeTransferCopyObject, jobs.JobTypeTransferMoveObject:
		if err := validateTransferCopyMoveObjectPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeTransferCopyBatch, jobs.JobTypeTransferMoveBatch:
		if err := validateTransferCopyMoveBatchPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeTransferCopyPrefix, jobs.JobTypeTransferMovePrefix:
		if err := validateTransferCopyMovePrefixPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	case jobs.JobTypeS3IndexObjects:
		if err := validateS3IndexObjectsPayload(payload); err != nil {
			return newJobSubmissionValidationError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	}

	if jobs.RequiresRclone(jobType) {
		if _, _, err := jobs.EnsureRcloneCompatible(ctx); err != nil {
			if failure := classifyRcloneCapabilityFailure(err, "rclone is required for this job type (install it or set RCLONE_PATH)"); failure != nil {
				return newJobSubmissionValidationError(http.StatusBadRequest, failure.code, failure.message, failure.details)
			}
			return newJobSubmissionValidationError(
				http.StatusInternalServerError,
				"internal_error",
				"failed to validate transfer engine",
				nil,
			)
		}
	}

	return nil
}

func (s *server) createAndEnqueueJob(ctx context.Context, profileID, jobType string, payload map[string]any) (models.Job, *jobs.QueueStats, error) {
	job, err := s.store.CreateJob(ctx, profileID, store.CreateJobInput{
		Type:    jobType,
		Payload: payload,
	})
	if err != nil {
		return models.Job{}, nil, err
	}

	if err := s.jobs.Enqueue(job.ID); err != nil {
		if rollbackErr := s.rollbackCreatedJobAfterEnqueueFailure(ctx, profileID, job, err); rollbackErr != nil {
			return job, nil, rollbackErr
		}
		if errors.Is(err, jobs.ErrJobQueueFull) {
			stats := s.jobs.QueueStats()
			return job, &stats, err
		}
		return job, nil, err
	}
	logJobEnqueued(ctx, profileID, job.ID, jobType)

	return job, nil, nil
}

func jobEnqueueLogFields(ctx context.Context, profileID, jobID, jobType string) map[string]any {
	fields := map[string]any{
		"event":      "job.enqueued",
		"profile_id": profileID,
		"job_id":     jobID,
		"job_type":   jobType,
	}
	if requestID := chimiddleware.GetReqID(ctx); requestID != "" {
		fields["request_id"] = requestID
	}
	return fields
}

func logJobEnqueued(ctx context.Context, profileID, jobID, jobType string) {
	logging.InfoFields("job enqueued", jobEnqueueLogFields(ctx, profileID, jobID, jobType))
}

func (s *server) rollbackCreatedJobAfterEnqueueFailure(
	ctx context.Context,
	profileID string,
	job models.Job,
	enqueueErr error,
) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), jobEnqueueRollbackTimeout)
	defer cancel()

	if _, err := s.store.DeleteJob(cleanupCtx, profileID, job.ID); err != nil {
		logging.ErrorFields("created job rollback failed after enqueue failure", map[string]any{
			"event":          "job.enqueue_rollback_failed",
			"profile_id":     profileID,
			"job_id":         job.ID,
			"enqueue_error":  enqueueErr.Error(),
			"rollback_error": err.Error(),
		})
		return fmt.Errorf("job enqueue failed and created job rollback failed: %w", err)
	}
	return nil
}

func (s *server) submitRunnableJob(
	ctx context.Context,
	profileID string,
	request jobSubmissionRequest,
) (models.Job, *jobs.QueueStats, error) {
	if err := s.validateRunnableJobRequest(ctx, request.Type, request.Payload); err != nil {
		return models.Job{}, nil, err
	}
	return s.createAndEnqueueJob(ctx, profileID, request.Type, request.Payload)
}

func (s *server) prepareRetryJobSubmission(
	ctx context.Context,
	profileID string,
	jobID string,
) (jobSubmissionRequest, error) {
	job, ok, err := s.store.GetJob(ctx, profileID, jobID)
	if err != nil {
		return jobSubmissionRequest{}, newJobSubmissionPreparationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to load job",
			nil,
		)
	}
	if !ok {
		return jobSubmissionRequest{}, newJobSubmissionPreparationError(
			http.StatusNotFound,
			"not_found",
			"job not found",
			map[string]any{"jobId": jobID},
		)
	}
	return buildRetryJobSubmission(job)
}

func (s *server) finalizeSubmittedJob(job models.Job, options jobSubmissionSuccessOptions) {
	if options.IncrementRetried && s.metrics != nil {
		s.metrics.IncJobsRetried(options.JobType)
	}
	if s.hub != nil {
		s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})
	}
	if options.LogQueued {
		logging.InfoFields("job queued", map[string]any{
			"event":      "job.queued",
			"job_id":     job.ID,
			"job_type":   options.JobType,
			"profile_id": options.ProfileID,
		})
	}
}

func newJobSubmissionHTTPService(s *server) jobSubmissionHTTPService {
	return jobSubmissionHTTPService{server: s}
}

func (svc jobSubmissionHTTPService) prepareCreateSubmissionRequest(r *http.Request) jobSubmissionPreparedRequest {
	profileID, err := requireJobSubmissionProfileID(r)
	if err != nil {
		return jobSubmissionPreparedRequest{err: err}
	}
	submission, err := decodeCreateJobSubmissionRequest(r)
	if err != nil {
		return jobSubmissionPreparedRequest{err: err}
	}
	return jobSubmissionPreparedRequest{
		profileID:  profileID,
		submission: submission,
		successOptions: jobSubmissionSuccessOptions{
			ProfileID: profileID,
			JobType:   submission.Type,
			LogQueued: true,
		},
		failureOptions: jobSubmissionFailureOptions{
			ProfileID: profileID,
			JobType:   submission.Type,
		},
	}
}

func (svc jobSubmissionHTTPService) prepareRetrySubmissionRequest(r *http.Request) jobSubmissionPreparedRequest {
	profileID, jobID, err := requireRetryJobSubmissionRequest(r)
	if err != nil {
		return jobSubmissionPreparedRequest{err: err}
	}
	submission, err := svc.server.prepareRetryJobSubmission(r.Context(), profileID, jobID)
	if err != nil {
		return jobSubmissionPreparedRequest{err: err}
	}
	return jobSubmissionPreparedRequest{
		profileID:  profileID,
		submission: submission,
		successOptions: jobSubmissionSuccessOptions{
			JobType:          submission.Type,
			IncrementRetried: true,
		},
		failureOptions: jobSubmissionFailureOptions{
			ProfileID: profileID,
			JobType:   submission.Type,
		},
	}
}

func (svc jobSubmissionHTTPService) executePrepared(
	ctx context.Context,
	prepared jobSubmissionPreparedRequest,
) (models.Job, *jobs.QueueStats, jobSubmissionFailureOptions, error) {
	if prepared.err != nil {
		return models.Job{}, nil, jobSubmissionFailureOptions{}, nil
	}
	job, stats, err := svc.server.submitRunnableJob(ctx, prepared.profileID, prepared.submission)
	if err != nil {
		failureOptions := prepared.failureOptions
		failureOptions.JobID = job.ID
		return models.Job{}, stats, failureOptions, err
	}
	return job, nil, jobSubmissionFailureOptions{}, nil
}

func applyJobSubmissionHandleResultSideEffects(
	s *server,
	job models.Job,
	successOptions jobSubmissionSuccessOptions,
	stats *jobs.QueueStats,
	err error,
	failureOptions jobSubmissionFailureOptions,
) {
	if errors.Is(err, jobs.ErrJobQueueFull) && stats != nil {
		logging.ErrorFields("job queue full", map[string]any{
			"event":          "job.queue_full",
			"job_id":         failureOptions.JobID,
			"job_type":       failureOptions.JobType,
			"profile_id":     failureOptions.ProfileID,
			"queue_depth":    stats.Depth,
			"queue_capacity": stats.Capacity,
		})
	}
	if err == nil && s != nil {
		s.finalizeSubmittedJob(job, successOptions)
	}
}

func (svc jobSubmissionHTTPService) handleCreateJob(
	w http.ResponseWriter,
	r *http.Request,
) {
	prepared := svc.prepareCreateSubmissionRequest(r)
	if prepared.err != nil {
		if prepErr := (*jobSubmissionPreparationError)(nil); errors.As(prepared.err, &prepErr) {
			resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, resp)
			return
		}
		if validationErr := (*jobSubmissionValidationError)(nil); errors.As(prepared.err, &validationErr) {
			resp := buildAPIErrorResponse(validationErr.code, validationErr.message, validationErr.details)
			writeJSON(w, validationErr.status, resp)
			return
		}
	}

	job, stats, failureOptions, err := svc.executePrepared(r.Context(), prepared)
	applyJobSubmissionHandleResultSideEffects(svc.server, job, prepared.successOptions, stats, err, failureOptions)
	if err == nil {
		writeJSON(w, http.StatusCreated, job)
		return
	}
	if validationErr := (*jobSubmissionValidationError)(nil); errors.As(err, &validationErr) {
		resp := buildAPIErrorResponse(validationErr.code, validationErr.message, validationErr.details)
		writeJSON(w, validationErr.status, resp)
		return
	}
	if errors.Is(err, jobs.ErrJobQueueFull) && stats != nil {
		w.Header().Set("Retry-After", "2")
		resp := buildAPIErrorResponse(
			"job_queue_full",
			"job queue is full; try again later",
			map[string]any{"queueDepth": stats.Depth, "queueCapacity": stats.Capacity},
		)
		writeJSON(w, http.StatusTooManyRequests, resp)
		return
	}
	message := failureOptions.InternalMessage
	if message == "" {
		message = "failed to enqueue job"
	}
	resp := buildAPIErrorResponse("internal_error", message, nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc jobSubmissionHTTPService) handleRetryJob(
	w http.ResponseWriter,
	r *http.Request,
) {
	prepared := svc.prepareRetrySubmissionRequest(r)
	if prepared.err != nil {
		if prepErr := (*jobSubmissionPreparationError)(nil); errors.As(prepared.err, &prepErr) {
			resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, resp)
			return
		}
		if validationErr := (*jobSubmissionValidationError)(nil); errors.As(prepared.err, &validationErr) {
			resp := buildAPIErrorResponse(validationErr.code, validationErr.message, validationErr.details)
			writeJSON(w, validationErr.status, resp)
			return
		}
	}

	job, stats, failureOptions, err := svc.executePrepared(r.Context(), prepared)
	applyJobSubmissionHandleResultSideEffects(svc.server, job, prepared.successOptions, stats, err, failureOptions)
	if err == nil {
		writeJSON(w, http.StatusCreated, job)
		return
	}
	if validationErr := (*jobSubmissionValidationError)(nil); errors.As(err, &validationErr) {
		resp := buildAPIErrorResponse(validationErr.code, validationErr.message, validationErr.details)
		writeJSON(w, validationErr.status, resp)
		return
	}
	if errors.Is(err, jobs.ErrJobQueueFull) && stats != nil {
		w.Header().Set("Retry-After", "2")
		resp := buildAPIErrorResponse(
			"job_queue_full",
			"job queue is full; try again later",
			map[string]any{"queueDepth": stats.Depth, "queueCapacity": stats.Capacity},
		)
		writeJSON(w, http.StatusTooManyRequests, resp)
		return
	}
	message := failureOptions.InternalMessage
	if message == "" {
		message = "failed to enqueue job"
	}
	resp := buildAPIErrorResponse("internal_error", message, nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

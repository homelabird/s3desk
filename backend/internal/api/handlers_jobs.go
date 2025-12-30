package api

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/jobs"
	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func (s *server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	var (
		filter store.JobFilter
	)
	if status := r.URL.Query().Get("status"); status != "" {
		js := models.JobStatus(status)
		filter.Status = &js
	}
	if t := r.URL.Query().Get("type"); t != "" {
		filter.Type = &t
	}

	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	filter.Limit = limit

	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		filter.Cursor = &cursor
	}

	resp, err := s.store.ListJobs(r.Context(), profileID, filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list jobs", nil)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleCreateJob(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	var req models.JobCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	if req.Type == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "type is required", nil)
		return
	}
	if !s.jobs.IsSupportedJobType(req.Type) {
		writeError(w, http.StatusBadRequest, "invalid_request", "unsupported job type", map[string]any{"type": req.Type})
		return
	}
	if req.Payload == nil {
		req.Payload = map[string]any{}
	}

	switch req.Type {
	case jobs.JobTypeTransferSyncLocalToS3:
		if err := validateTransferSyncLocalToS3Payload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferSyncS3ToLocal:
		if err := validateTransferSyncS3ToLocalPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferSyncStagingToS3:
		if err := validateTransferSyncStagingToS3Payload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferDeletePrefix:
		if err := validateTransferDeletePrefixPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3ZipPrefix:
		if err := validateS3ZipPrefixPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3ZipObjects:
		if err := validateS3ZipObjectsPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3DeleteObjects:
		if err := validateS3DeleteObjectsPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferCopyObject, jobs.JobTypeTransferMoveObject:
		if err := validateTransferCopyMoveObjectPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferCopyBatch, jobs.JobTypeTransferMoveBatch:
		if err := validateTransferCopyMoveBatchPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferCopyPrefix, jobs.JobTypeTransferMovePrefix:
		if err := validateTransferCopyMovePrefixPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3IndexObjects:
		if err := validateS3IndexObjectsPayload(req.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	}

	if isTransferJobType(req.Type) {
		if _, ok := jobs.DetectRclone(); !ok {
			writeError(w, http.StatusBadRequest, "transfer_engine_missing", "rclone is required for this job type (install it or set RCLONE_PATH)", nil)
			return
		}
	}

	job, err := s.store.CreateJob(r.Context(), profileID, store.CreateJobInput{
		Type:    req.Type,
		Payload: req.Payload,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create job", nil)
		return
	}

	if err := s.jobs.Enqueue(job.ID); err != nil {
		finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
		if errors.Is(err, jobs.ErrJobQueueFull) {
			msg := "job queue is full; try again later"
			_ = s.store.UpdateJobStatus(r.Context(), job.ID, models.JobStatusFailed, nil, &finishedAt, nil, &msg)
			job.Status = models.JobStatusFailed
			job.Error = &msg
			job.FinishedAt = &finishedAt
			s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})
			stats := s.jobs.QueueStats()
			logging.ErrorFields("job queue full", map[string]any{
				"event":          "job.queue_full",
				"job_id":         job.ID,
				"job_type":       req.Type,
				"profile_id":     profileID,
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
			return
		}
		msg := "failed to enqueue job"
		_ = s.store.UpdateJobStatus(r.Context(), job.ID, models.JobStatusFailed, nil, &finishedAt, nil, &msg)
		job.Status = models.JobStatusFailed
		job.Error = &msg
		job.FinishedAt = &finishedAt
		s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to enqueue job", nil)
		return
	}

	s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})
	logging.InfoFields("job queued", map[string]any{
		"event":      "job.queued",
		"job_id":     job.ID,
		"job_type":   req.Type,
		"profile_id": profileID,
	})
	writeJSON(w, http.StatusCreated, job)
}

func (s *server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	jobID := chi.URLParam(r, "jobId")
	if profileID == "" || jobID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and jobId are required", nil)
		return
	}

	job, ok, err := s.store.GetJob(r.Context(), profileID, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load job", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "job not found", map[string]any{"jobId": jobID})
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *server) handleGetJobArtifact(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	jobID := chi.URLParam(r, "jobId")
	if profileID == "" || jobID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and jobId are required", nil)
		return
	}

	job, ok, err := s.store.GetJob(r.Context(), profileID, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load job", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "job not found", map[string]any{"jobId": jobID})
		return
	}

	switch job.Type {
	case jobs.JobTypeS3ZipPrefix, jobs.JobTypeS3ZipObjects:
		// ok
	default:
		writeError(w, http.StatusNotFound, "not_found", "job artifact not available for this job type", map[string]any{"type": job.Type})
		return
	}

	if job.Status != models.JobStatusSucceeded {
		writeError(w, http.StatusConflict, "conflict", "job artifact is only available after the job succeeds", map[string]any{"status": job.Status})
		return
	}

	artifactPath := filepath.Join(s.cfg.DataDir, "artifacts", "jobs", jobID+".zip")
	f, err := os.Open(artifactPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(w, http.StatusNotFound, "not_found", "job artifact not found", map[string]any{"jobId": jobID})
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to open job artifact", nil)
		return
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to stat job artifact", nil)
		return
	}

	filename := jobArtifactFilename(job)
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	http.ServeContent(w, r, filename, info.ModTime(), f)
}

func (s *server) handleDeleteJob(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	jobID := chi.URLParam(r, "jobId")
	if profileID == "" || jobID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and jobId are required", nil)
		return
	}

	job, ok, err := s.store.GetJob(r.Context(), profileID, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load job", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "job not found", map[string]any{"jobId": jobID})
		return
	}

	switch job.Status {
	case models.JobStatusQueued, models.JobStatusRunning:
		writeError(w, http.StatusConflict, "conflict", "cannot delete an active job; cancel it first", map[string]any{"status": job.Status})
		return
	}

	deleted, err := s.store.DeleteJob(r.Context(), profileID, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to delete job", nil)
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "not_found", "job not found", map[string]any{"jobId": jobID})
		return
	}

	logPath := filepath.Join(s.cfg.DataDir, "logs", "jobs", jobID+".log")
	_ = os.Remove(logPath)
	_ = os.Remove(filepath.Join(s.cfg.DataDir, "logs", "jobs", jobID+".cmd"))
	_ = os.Remove(filepath.Join(s.cfg.DataDir, "artifacts", "jobs", jobID+".zip"))
	_ = os.Remove(filepath.Join(s.cfg.DataDir, "artifacts", "jobs", jobID+".zip.tmp"))

	s.hub.Publish(ws.Event{Type: "jobs.deleted", Payload: map[string]any{"jobIds": []string{jobID}, "reason": "manual"}})

	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleRetryJob(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	jobID := chi.URLParam(r, "jobId")
	if profileID == "" || jobID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and jobId are required", nil)
		return
	}

	job, ok, err := s.store.GetJob(r.Context(), profileID, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load job", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "job not found", map[string]any{"jobId": jobID})
		return
	}

	switch job.Status {
	case models.JobStatusFailed, models.JobStatusCanceled:
		// ok
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "job is not retryable (only failed/canceled)", map[string]any{"status": job.Status})
		return
	}
	if !s.jobs.IsSupportedJobType(job.Type) {
		writeError(w, http.StatusBadRequest, "invalid_request", "unsupported job type", map[string]any{"type": job.Type})
		return
	}

	switch job.Type {
	case jobs.JobTypeTransferSyncLocalToS3:
		if err := validateTransferSyncLocalToS3Payload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferSyncS3ToLocal:
		if err := validateTransferSyncS3ToLocalPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferSyncStagingToS3:
		if err := validateTransferSyncStagingToS3Payload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferDeletePrefix:
		if err := validateTransferDeletePrefixPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3ZipPrefix:
		if err := validateS3ZipPrefixPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3ZipObjects:
		if err := validateS3ZipObjectsPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3DeleteObjects:
		if err := validateS3DeleteObjectsPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferCopyObject, jobs.JobTypeTransferMoveObject:
		if err := validateTransferCopyMoveObjectPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferCopyBatch, jobs.JobTypeTransferMoveBatch:
		if err := validateTransferCopyMoveBatchPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeTransferCopyPrefix, jobs.JobTypeTransferMovePrefix:
		if err := validateTransferCopyMovePrefixPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	case jobs.JobTypeS3IndexObjects:
		if err := validateS3IndexObjectsPayload(job.Payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
	}

	if isTransferJobType(job.Type) {
		if _, ok := jobs.DetectRclone(); !ok {
			writeError(w, http.StatusBadRequest, "transfer_engine_missing", "rclone is required for this job type (install it or set RCLONE_PATH)", nil)
			return
		}
	}

	newJob, err := s.store.CreateJob(r.Context(), profileID, store.CreateJobInput{
		Type:    job.Type,
		Payload: job.Payload,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create job", nil)
		return
	}

	if err := s.jobs.Enqueue(newJob.ID); err != nil {
		if errors.Is(err, jobs.ErrJobQueueFull) {
			_, _ = s.store.DeleteJob(r.Context(), profileID, newJob.ID)
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
		_, _ = s.store.DeleteJob(r.Context(), profileID, newJob.ID)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to enqueue job", nil)
		return
	}

	s.hub.Publish(ws.Event{Type: "job.created", JobID: newJob.ID, Payload: map[string]any{"job": newJob}})
	writeJSON(w, http.StatusCreated, newJob)
}

func (s *server) handleGetJobLogs(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	jobID := chi.URLParam(r, "jobId")
	if profileID == "" || jobID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and jobId are required", nil)
		return
	}

	_, ok, err := s.store.GetJob(r.Context(), profileID, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load job", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "job not found", map[string]any{"jobId": jobID})
		return
	}

	tailBytes := int64(64 * 1024)
	if raw := r.URL.Query().Get("tailBytes"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			tailBytes = parsed
		}
	}
	if tailBytes < 1 {
		tailBytes = 1
	}
	if tailBytes > 1024*1024 {
		tailBytes = 1024 * 1024
	}

	logPath := filepath.Join(s.cfg.DataDir, "logs", "jobs", jobID+".log")

	if raw := r.URL.Query().Get("afterOffset"); raw != "" {
		afterOffset, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || afterOffset < 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid afterOffset", map[string]any{"afterOffset": raw})
			return
		}

		maxBytes := int64(64 * 1024)
		if rawMax := r.URL.Query().Get("maxBytes"); rawMax != "" {
			if parsed, err := strconv.ParseInt(rawMax, 10, 64); err == nil {
				maxBytes = parsed
			}
		}
		if maxBytes < 1 {
			maxBytes = 1
		}
		if maxBytes > 1024*1024 {
			maxBytes = 1024 * 1024
		}

		f, err := os.Open(logPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.Header().Set("X-Log-Next-Offset", "0")
				w.WriteHeader(http.StatusOK)
				return
			}
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to open log file", nil)
			return
		}
		defer func() { _ = f.Close() }()

		info, err := f.Stat()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to stat log file", nil)
			return
		}

		size := info.Size()
		if afterOffset > size {
			if size > maxBytes {
				afterOffset = size - maxBytes
			} else {
				afterOffset = 0
			}
		}
		if _, err := f.Seek(afterOffset, io.SeekStart); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to read log file", nil)
			return
		}

		b, err := io.ReadAll(io.LimitReader(f, maxBytes))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to read log file", nil)
			return
		}
		nextOffset := afterOffset + int64(len(b))

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("X-Log-Next-Offset", strconv.FormatInt(nextOffset, 10))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(b)
		return
	}

	f, err := os.Open(logPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("X-Log-Next-Offset", "0")
			w.WriteHeader(http.StatusOK)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to open log file", nil)
		return
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to stat log file", nil)
		return
	}

	size := info.Size()
	start := int64(0)
	if size > tailBytes {
		start = size - tailBytes
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to read log file", nil)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Log-Next-Offset", strconv.FormatInt(size, 10))
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, f)
}

func (s *server) handleCancelJob(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	jobID := chi.URLParam(r, "jobId")
	if profileID == "" || jobID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and jobId are required", nil)
		return
	}

	job, ok, err := s.store.GetJob(r.Context(), profileID, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load job", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "job not found", map[string]any{"jobId": jobID})
		return
	}

	switch job.Status {
	case models.JobStatusQueued:
		finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
		_ = s.store.UpdateJobStatus(r.Context(), jobID, models.JobStatusCanceled, nil, &finishedAt, nil, nil)
		payload := map[string]any{"status": models.JobStatusCanceled}
		s.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
	case models.JobStatusRunning:
		s.jobs.Cancel(jobID)
	}

	job, _, _ = s.store.GetJob(r.Context(), profileID, jobID)
	writeJSON(w, http.StatusOK, job)
}

func isTransferJobType(jobType string) bool {
	switch jobType {
	case jobs.JobTypeTransferSyncLocalToS3,
		jobs.JobTypeTransferSyncS3ToLocal,
		jobs.JobTypeTransferSyncStagingToS3,
		jobs.JobTypeTransferDeletePrefix,
		jobs.JobTypeTransferCopyObject,
		jobs.JobTypeTransferMoveObject,
		jobs.JobTypeTransferCopyBatch,
		jobs.JobTypeTransferMoveBatch,
		jobs.JobTypeTransferCopyPrefix,
		jobs.JobTypeTransferMovePrefix:
		return true
	default:
		return false
	}
}

func validateS3ZipPrefixPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimLeft(strings.TrimSpace(prefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if strings.ContainsRune(prefix, 0) {
		return errors.New("payload.prefix contains invalid characters")
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	return nil
}

func validateS3ZipObjectsPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	stripPrefix, _ := payload["stripPrefix"].(string)

	bucket = strings.TrimSpace(bucket)
	stripPrefix = strings.TrimLeft(strings.TrimSpace(stripPrefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}

	rawKeys, ok := payload["keys"].([]any)
	if !ok || len(rawKeys) == 0 {
		return errors.New("payload.keys must contain at least one key")
	}
	if len(rawKeys) > 10_000 {
		return errors.New("payload.keys is too large (max 10000)")
	}

	keys := make([]string, 0, len(rawKeys))
	for i, v := range rawKeys {
		k, ok := v.(string)
		if !ok {
			return fmt.Errorf("payload.keys[%d] must be a string", i)
		}
		k = strings.TrimPrefix(strings.TrimSpace(k), "/")
		if k == "" {
			return errors.New("payload.keys contains an empty key")
		}
		if strings.ContainsRune(k, 0) {
			return errors.New("payload.keys contains an invalid key")
		}
		keys = append(keys, k)
	}
	if strings.ContainsRune(stripPrefix, 0) {
		return errors.New("payload.stripPrefix contains invalid characters")
	}

	payload["bucket"] = bucket
	payload["stripPrefix"] = stripPrefix
	payload["keys"] = keys
	return nil
}

func jobArtifactFilename(job models.Job) string {
	bucket, _ := job.Payload["bucket"].(string)
	prefix, _ := job.Payload["prefix"].(string)
	stripPrefix, _ := job.Payload["stripPrefix"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.Trim(strings.TrimLeft(strings.TrimSpace(prefix), "/"), "/")
	stripPrefix = strings.Trim(strings.TrimLeft(strings.TrimSpace(stripPrefix), "/"), "/")

	base := "download"
	switch job.Type {
	case jobs.JobTypeS3ZipPrefix:
		if bucket != "" && prefix != "" {
			base = bucket + "-" + prefix
		} else if bucket != "" {
			base = bucket
		}
	case jobs.JobTypeS3ZipObjects:
		if bucket != "" && stripPrefix != "" {
			base = bucket + "-" + stripPrefix
		} else if bucket != "" {
			base = bucket + "-selection"
		}
	default:
		if job.ID != "" {
			base = "job-" + job.ID
		}
	}
	return safeFilename(base) + ".zip"
}

func safeFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "download"
	}
	var b strings.Builder
	b.Grow(len(value))
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.' || r == ' ':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	out := strings.TrimSpace(b.String())
	out = strings.Trim(out, ".")
	out = strings.ReplaceAll(out, " ", "-")
	out = strings.Trim(out, "-")
	if out == "" {
		out = "download"
	}
	if len(out) > 120 {
		out = out[:120]
	}
	return out
}

func validateTransferDeletePrefixPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	deleteAll, _ := payload["deleteAll"].(bool)
	allowUnsafePrefix, _ := payload["allowUnsafePrefix"].(bool)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimLeft(strings.TrimSpace(prefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if deleteAll && prefix != "" {
		return errors.New("payload.prefix must be empty when payload.deleteAll=true")
	}
	if prefix == "" && !deleteAll {
		return errors.New("payload.prefix is required (or set payload.deleteAll=true)")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}
	if prefix != "" && !strings.HasSuffix(prefix, "/") && !allowUnsafePrefix {
		return errors.New("payload.prefix must end with '/' (or set payload.allowUnsafePrefix=true)")
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	return nil
}

func validateTransferSyncLocalToS3Payload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	localPath, _ := payload["localPath"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")
	localPath = strings.TrimSpace(localPath)

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if localPath == "" {
		return errors.New("payload.localPath is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	payload["localPath"] = localPath
	return nil
}

func validateTransferSyncS3ToLocalPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	localPath, _ := payload["localPath"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")
	localPath = strings.TrimSpace(localPath)

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if localPath == "" {
		return errors.New("payload.localPath is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	payload["localPath"] = localPath
	return nil
}

func validateTransferSyncStagingToS3Payload(payload map[string]any) error {
	uploadID, _ := payload["uploadId"].(string)
	uploadID = strings.TrimSpace(uploadID)
	if uploadID == "" {
		return errors.New("payload.uploadId is required")
	}
	payload["uploadId"] = uploadID
	return nil
}

func validateS3DeleteObjectsPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return errors.New("payload.bucket is required")
	}

	rawKeys, ok := payload["keys"].([]any)
	if !ok {
		return errors.New("payload.keys must be an array of strings")
	}
	keys := make([]string, 0, len(rawKeys))
	for _, item := range rawKeys {
		s, ok := item.(string)
		if !ok {
			return errors.New("payload.keys must be an array of strings")
		}
		if s == "" {
			continue
		}
		keys = append(keys, s)
	}
	if len(keys) == 0 {
		return errors.New("payload.keys must contain at least one key")
	}
	if len(keys) > 50_000 {
		return errors.New("payload.keys is too large (max 50000); use a prefix delete job instead")
	}

	payload["bucket"] = bucket
	payload["keys"] = keys
	return nil
}

func validateS3IndexObjectsPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}

	fullReindex := true
	if v, ok := payload["fullReindex"]; ok {
		b, ok := v.(bool)
		if !ok {
			return errors.New("payload.fullReindex must be a boolean")
		}
		fullReindex = b
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	payload["fullReindex"] = fullReindex
	return nil
}

func validateTransferCopyMoveObjectPayload(payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcKey, _ := payload["srcKey"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstKey, _ := payload["dstKey"].(string)

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	payload["srcBucket"] = srcBucket
	payload["srcKey"] = srcKey
	payload["dstBucket"] = dstBucket
	payload["dstKey"] = dstKey
	return nil
}

func validateTransferCopyMoveBatchPayload(payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	dstBucket, _ := payload["dstBucket"].(string)

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)

	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}

	rawItems, ok := payload["items"].([]any)
	if !ok || len(rawItems) < 1 {
		return errors.New("payload.items is required")
	}
	if len(rawItems) > 5000 {
		return errors.New("payload.items exceeds max length (5000)")
	}

	sanitized := make([]any, 0, len(rawItems))
	for i, item := range rawItems {
		mm, ok := item.(map[string]any)
		if !ok {
			return fmt.Errorf("payload.items[%d] must be an object", i)
		}
		srcKey, _ := mm["srcKey"].(string)
		dstKey, _ := mm["dstKey"].(string)
		srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
		dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")
		if srcKey == "" || dstKey == "" {
			return fmt.Errorf("payload.items[%d].srcKey and payload.items[%d].dstKey are required", i, i)
		}
		if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
			return fmt.Errorf("wildcards are not allowed in keys (items[%d])", i)
		}
		if srcBucket == dstBucket && srcKey == dstKey {
			return fmt.Errorf("source and destination must be different (items[%d])", i)
		}
		sanitized = append(sanitized, map[string]any{"srcKey": srcKey, "dstKey": dstKey})
	}

	payload["srcBucket"] = srcBucket
	payload["dstBucket"] = dstBucket
	payload["items"] = sanitized
	return nil
}

func validateTransferCopyMovePrefixPayload(payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcPrefix, _ := payload["srcPrefix"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstPrefix, _ := payload["dstPrefix"].(string)

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = strings.TrimPrefix(strings.TrimSpace(srcPrefix), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = strings.TrimPrefix(strings.TrimSpace(dstPrefix), "/")

	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if srcPrefix == "" {
		return errors.New("payload.srcPrefix is required")
	}
	if strings.Contains(srcPrefix, "*") || strings.Contains(dstPrefix, "*") {
		return errors.New("wildcards are not allowed in prefixes")
	}
	if !strings.HasSuffix(srcPrefix, "/") {
		return errors.New("payload.srcPrefix must end with '/'")
	}
	if dstPrefix != "" && !strings.HasSuffix(dstPrefix, "/") {
		dstPrefix += "/"
	}
	if srcBucket == dstBucket && dstPrefix != "" {
		if dstPrefix == srcPrefix {
			return errors.New("source and destination must be different")
		}
		if strings.HasPrefix(dstPrefix, srcPrefix) {
			return errors.New("destination prefix must not be under source prefix")
		}
	}

	payload["srcBucket"] = srcBucket
	payload["srcPrefix"] = srcPrefix
	payload["dstBucket"] = dstBucket
	payload["dstPrefix"] = dstPrefix
	return nil
}

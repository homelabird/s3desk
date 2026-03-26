package jobs

import (
	"context"
	"errors"
	"time"

	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/ws"
)

func (m *Manager) runJob(rootCtx context.Context, jobID string) error {
	profileID, job, ok, err := m.store.GetJobByID(rootCtx, jobID)
	if err != nil || !ok {
		return err
	}
	if job.Status != models.JobStatusQueued {
		return nil
	}

	profile, ok, err := m.store.GetProfile(rootCtx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrProfileNotFound
	}
	preserveLeadingSlash := profile.PreserveLeadingSlash

	start := time.Now()
	logging.InfoFields("job started", map[string]any{
		"event":      "job.started",
		"job_id":     jobID,
		"job_type":   job.Type,
		"profile_id": profileID,
	})
	if m.metrics != nil {
		m.metrics.IncJobsStarted(job.Type)
	}

	ctx, cancel := context.WithCancel(rootCtx)
	ctx = withJobType(ctx, job.Type)
	m.mu.Lock()
	m.cancels[jobID] = cancel
	m.mu.Unlock()
	defer func() {
		cancel()
		m.mu.Lock()
		delete(m.cancels, jobID)
		m.mu.Unlock()
	}()

	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := m.store.UpdateJobStatus(rootCtx, jobID, models.JobStatusRunning, &startedAt, nil, nil, nil, nil); err != nil {
		return err
	}
	m.hub.Publish(ws.Event{Type: "job.progress", JobID: jobID, Payload: map[string]any{"status": models.JobStatusRunning}})

	runErr := m.dispatchJobExecution(ctx, profileID, jobID, job, preserveLeadingSlash)

	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	duration := time.Since(start)
	if errors.Is(ctx.Err(), context.Canceled) {
		code := ErrorCodeCanceled
		if err := m.finalizeJob(jobID, models.JobStatusCanceled, &finishedAt, nil, &code); err != nil {
			logging.ErrorFields("failed to finalize canceled job", map[string]any{
				"event":      "job.finalize_failed",
				"job_id":     jobID,
				"job_type":   job.Type,
				"profile_id": profileID,
				"status":     models.JobStatusCanceled,
				"error_code": code,
				"error":      err.Error(),
			})
			return err
		}

		payload := map[string]any{"status": models.JobStatusCanceled, "errorCode": code}
		if jp := m.loadJobProgress(jobID); jp != nil {
			payload["progress"] = jp
			if m.metrics != nil {
				if dir := transferDirectionForJobType(job.Type); dir != "" && jp.BytesDone != nil && *jp.BytesDone > 0 {
					m.metrics.AddTransferBytes(dir, *jp.BytesDone)
				}
			}
		}
		m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
		if m.metrics != nil {
			m.metrics.IncJobsCanceled(job.Type)
			m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusCanceled), &code)
			m.metrics.ObserveJobsDuration(job.Type, string(models.JobStatusCanceled), &code, duration)
		}
		logging.InfoFields("job canceled", map[string]any{
			"event":       "job.completed",
			"job_id":      jobID,
			"job_type":    job.Type,
			"profile_id":  profileID,
			"status":      models.JobStatusCanceled,
			"error_code":  code,
			"duration_ms": duration.Milliseconds(),
		})
		return nil
	}
	if runErr != nil {
		msg := runErr.Error()
		code := ErrorCodeUnknown
		if c, ok := jobErrorCode(runErr); ok {
			code = c
		} else {
			switch {
			case errors.Is(runErr, ErrProfileNotFound):
				code = ErrorCodeNotFound
			case errors.Is(runErr, ErrRcloneNotFound):
				code = ErrorCodeTransferEngineMissing
			default:
				var inc *RcloneIncompatibleError
				if errors.As(runErr, &inc) {
					code = ErrorCodeTransferEngineIncompatible
				} else if errors.Is(runErr, context.Canceled) {
					code = ErrorCodeCanceled
				}
			}
		}
		if err := m.finalizeJob(jobID, models.JobStatusFailed, &finishedAt, &msg, &code); err != nil {
			logging.ErrorFields("failed to finalize failed job", map[string]any{
				"event":      "job.finalize_failed",
				"job_id":     jobID,
				"job_type":   job.Type,
				"profile_id": profileID,
				"status":     models.JobStatusFailed,
				"error_code": code,
				"error":      err.Error(),
			})
			return errors.Join(runErr, err)
		}
		payload := map[string]any{"status": models.JobStatusFailed, "error": msg, "errorCode": code}
		if jp := m.loadJobProgress(jobID); jp != nil {
			payload["progress"] = jp
			if m.metrics != nil {
				if dir := transferDirectionForJobType(job.Type); dir != "" && jp.BytesDone != nil && *jp.BytesDone > 0 {
					m.metrics.AddTransferBytes(dir, *jp.BytesDone)
				}
			}
		}
		m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
		if m.metrics != nil {
			m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusFailed), &code)
			m.metrics.ObserveJobsDuration(job.Type, string(models.JobStatusFailed), &code, duration)
			if isTransferJobType(job.Type) {
				m.metrics.IncTransferErrors(code)
			}
		}
		logging.ErrorFields("job failed", map[string]any{
			"event":       "job.completed",
			"job_id":      jobID,
			"job_type":    job.Type,
			"profile_id":  profileID,
			"status":      models.JobStatusFailed,
			"error":       msg,
			"error_code":  code,
			"duration_ms": duration.Milliseconds(),
		})
		return runErr
	}

	if err := m.finalizeJob(jobID, models.JobStatusSucceeded, &finishedAt, nil, nil); err != nil {
		logging.ErrorFields("failed to finalize succeeded job", map[string]any{
			"event":      "job.finalize_failed",
			"job_id":     jobID,
			"job_type":   job.Type,
			"profile_id": profileID,
			"status":     models.JobStatusSucceeded,
			"error":      err.Error(),
		})
		return err
	}
	payload := map[string]any{"status": models.JobStatusSucceeded}
	if jp := m.loadJobProgress(jobID); jp != nil {
		payload["progress"] = jp
		if m.metrics != nil {
			if dir := transferDirectionForJobType(job.Type); dir != "" && jp.BytesDone != nil && *jp.BytesDone > 0 {
				m.metrics.AddTransferBytes(dir, *jp.BytesDone)
			}
		}
	}
	m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
	if m.metrics != nil {
		m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusSucceeded), nil)
		m.metrics.ObserveJobsDuration(job.Type, string(models.JobStatusSucceeded), nil, duration)
	}
	logging.InfoFields("job completed", map[string]any{
		"event":       "job.completed",
		"job_id":      jobID,
		"job_type":    job.Type,
		"profile_id":  profileID,
		"status":      models.JobStatusSucceeded,
		"duration_ms": duration.Milliseconds(),
	})
	return nil
}

func (m *Manager) loadJobProgress(jobID string) *models.JobProgress {
	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_, job, ok, err := m.store.GetJobByID(updateCtx, jobID)
	cancel()
	if err != nil || !ok {
		return nil
	}
	return job.Progress
}

func (m *Manager) finalizeJob(jobID string, status models.JobStatus, finishedAt *string, errMsg *string, errorCode *string) error {
	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_, job, ok, err := m.store.GetJobByID(updateCtx, jobID)
	cancel()

	var jp *models.JobProgress
	if err == nil && ok && job.Progress != nil {
		copied := *job.Progress
		copied.ObjectsPerSecond = nil
		copied.SpeedBps = nil
		copied.EtaSeconds = nil
		jp = &copied
	}

	updateCtx, cancel = context.WithTimeout(context.Background(), 2*time.Second)
	err = m.store.UpdateJobStatus(updateCtx, jobID, status, nil, finishedAt, jp, errMsg, errorCode)
	cancel()
	return err
}

func (m *Manager) persistAndPublishRunningProgress(jobID string, jp *models.JobProgress) error {
	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	err := m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil, nil)
	cancel()
	if err != nil {
		return err
	}
	m.hub.Publish(ws.Event{
		Type:  "job.progress",
		JobID: jobID,
		Payload: map[string]any{
			"status":   models.JobStatusRunning,
			"progress": jp,
		},
	})
	return nil
}

func (m *Manager) logProgressPersistenceError(jobID string, err error) {
	logging.WarnFields("job progress persistence failed", map[string]any{
		"event":   "job.progress_persist_failed",
		"job_id":  jobID,
		"warning": err.Error(),
	})
}

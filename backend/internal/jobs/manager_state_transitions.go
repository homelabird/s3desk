package jobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/ws"
)

func (m *Manager) RecoverAndRequeue(ctx context.Context) error {
	// app.Run holds the DATA_DIR lock before recovery, so pre-existing API temp
	// configs belong to a stopped process and can be removed immediately.
	m.cleanupStartupAPIRcloneConfigs(ctx)

	runningJobs, err := m.store.ListJobsByStatus(ctx, models.JobStatusRunning)
	if err != nil {
		return err
	}
	if len(runningJobs) > 0 {
		msg := "server restarted"
		code := ErrorCodeServerRestarted
		for _, stored := range runningJobs {
			profileID, job, id := stored.ProfileID, stored.Job, stored.Job.ID
			finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
			if err := m.finalizeJob(id, models.JobStatusFailed, &finishedAt, &msg, &code); err != nil {
				if errors.Is(err, ErrJobStatusConflict) {
					continue
				}
				return err
			}

			payload := map[string]any{"status": models.JobStatusFailed, "error": msg, "errorCode": code}
			if jp := m.loadJobProgress(id); jp != nil {
				payload["progress"] = jp
			}
			m.hub.Publish(ws.Event{Type: "job.completed", JobID: id, Payload: payload})
			if m.metrics != nil {
				m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusFailed), &code)
				if isTransferJobType(job.Type) {
					m.metrics.IncTransferErrors(code)
				}
			}

			logging.ErrorFields("job failed after restart", map[string]any{
				"event":      "job.completed",
				"job_id":     id,
				"job_type":   job.Type,
				"profile_id": profileID,
				"status":     models.JobStatusFailed,
				"error":      msg,
				"error_code": code,
			})
		}
	}
	queuedJobs, err := m.store.ListJobsByStatus(ctx, models.JobStatusQueued)
	if err != nil {
		return err
	}
	supportedIDs := make([]string, 0, len(queuedJobs))
	for _, stored := range queuedJobs {
		profileID, job, id := stored.ProfileID, stored.Job, stored.Job.ID
		if m.IsSupportedJobType(job.Type) {
			supportedIDs = append(supportedIDs, id)
			continue
		}

		finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
		msg := fmt.Sprintf("unsupported job type: %s", job.Type)
		code := ErrorCodeUnknown
		updated, err := m.store.UpdateJobStatusIfCurrent(
			ctx,
			id,
			[]models.JobStatus{models.JobStatusQueued},
			models.JobStatusFailed,
			nil,
			&finishedAt,
			nil,
			&msg,
			&code,
		)
		if err != nil {
			return err
		}
		if !updated {
			continue
		}

		m.hub.Publish(ws.Event{
			Type:  "job.completed",
			JobID: id,
			Payload: map[string]any{
				"status":    models.JobStatusFailed,
				"error":     msg,
				"errorCode": code,
			},
		})
		if m.metrics != nil {
			m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusFailed), &code)
			if isTransferJobType(job.Type) {
				m.metrics.IncTransferErrors(code)
			}
		}
		logging.WarnFields("queued job rejected during recovery", map[string]any{
			"event":      "job.recovery_rejected",
			"job_id":     id,
			"job_type":   job.Type,
			"profile_id": profileID,
			"status":     models.JobStatusFailed,
			"error":      msg,
			"error_code": code,
		})
	}

	for i, id := range supportedIDs {
		if err := m.Enqueue(id); err != nil {
			if errors.Is(err, ErrJobQueueFull) {
				remaining := append([]string(nil), supportedIDs[i:]...)
				m.lifecycleWG.Add(1)
				go func() {
					defer m.lifecycleWG.Done()
					m.enqueueBlocking(ctx, remaining)
				}()
				break
			}
			return err
		}
	}
	return nil
}

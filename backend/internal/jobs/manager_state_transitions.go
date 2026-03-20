package jobs

import (
	"context"
	"errors"
	"time"

	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/ws"
)

func (m *Manager) RecoverAndRequeue(ctx context.Context) error {
	runningIDs, err := m.store.ListJobIDsByStatus(ctx, models.JobStatusRunning)
	if err != nil {
		return err
	}
	if len(runningIDs) > 0 {
		msg := "server restarted"
		code := ErrorCodeServerRestarted
		for _, id := range runningIDs {
			profileID, job, ok, err := m.store.GetJobByID(ctx, id)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
			if err := m.finalizeJob(id, models.JobStatusFailed, &finishedAt, &msg, &code); err != nil {
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
	queuedIDs, err := m.store.ListJobIDsByStatus(ctx, models.JobStatusQueued)
	if err != nil {
		return err
	}
	for i, id := range queuedIDs {
		if err := m.Enqueue(id); err != nil {
			if errors.Is(err, ErrJobQueueFull) {
				remaining := append([]string(nil), queuedIDs[i:]...)
				go m.enqueueBlocking(ctx, remaining)
				break
			}
			return err
		}
	}
	return nil
}

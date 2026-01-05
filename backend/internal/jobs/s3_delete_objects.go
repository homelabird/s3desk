package jobs

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/ws"
)

func (m *Manager) runS3DeleteObjects(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	keys := stringSlice(payload["keys"])

	bucket = strings.TrimSpace(bucket)
	keys = trimEmpty(keys)

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if len(keys) == 0 {
		return errors.New("payload.keys must contain at least one key")
	}

	logPath := filepath.Join(m.dataDir, "logs", "jobs", jobID+".log")
	logFile, err := openJobLogWriter(logPath, m.logMaxBytes)
	if err != nil {
		return err
	}
	defer func() { _ = logFile.Close() }()

	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("profile not found")
	}

	ot := int64(len(keys))
	startedAt := time.Now()
	m.updateAndPublishProgress(jobID, &models.JobProgress{ObjectsTotal: &ot, ObjectsDone: int64Ptr(0)})
	m.writeJobLog(logFile, jobID, "info", fmt.Sprintf("deleting %d object(s) from s3://%s", ot, bucket))

	const batchSize = 1000
	var objectsDone int64

	for i := 0; i < len(keys); i += batchSize {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		end := i + batchSize
		if end > len(keys) {
			end = len(keys)
		}
		batch := keys[i:end]

		tmpFile, err := os.CreateTemp("", "rclone-delete-*.txt")
		if err != nil {
			m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("failed to create delete list: %v", err))
			return err
		}
		tmpPath := tmpFile.Name()
		writer := bufio.NewWriter(tmpFile)
		for _, k := range batch {
			if _, err := writer.WriteString(k + "\n"); err != nil {
				_ = tmpFile.Close()
				_ = os.Remove(tmpPath)
				m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("failed to write delete list: %v", err))
				return err
			}
		}
		if err := writer.Flush(); err != nil {
			_ = tmpFile.Close()
			_ = os.Remove(tmpPath)
			m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("failed to write delete list: %v", err))
			return err
		}
		if err := tmpFile.Close(); err != nil {
			_ = os.Remove(tmpPath)
			m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("failed to write delete list: %v", err))
			return err
		}

		args := []string{"delete", "--files-from-raw", tmpPath, rcloneRemoteBucket(bucket)}
		proc, err := m.startRcloneCommand(ctx, profileSecrets, jobID, args)
		if err != nil {
			_ = os.Remove(tmpPath)
			m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("rclone delete failed: %v", err))
			return err
		}
		_, _ = io.Copy(io.Discard, proc.stdout)
		waitErr := proc.wait()
		_ = os.Remove(tmpPath)
		if waitErr != nil {
			err := jobErrorFromRclone(waitErr, proc.stderr.String(), "rclone delete")
			m.writeJobLog(logFile, jobID, "error", err.Error())
			return err
		}

		objectsDone += int64(len(batch))

		od := objectsDone
		jp := &models.JobProgress{ObjectsTotal: &ot, ObjectsDone: &od}
		if od > 0 {
			if elapsed := time.Since(startedAt).Seconds(); elapsed > 0 {
				rate := float64(od) / elapsed
				if rate > 0 {
					opsPerSecond := int64(math.Round(rate))
					if opsPerSecond < 1 {
						opsPerSecond = 1
					}
					jp.ObjectsPerSecond = &opsPerSecond
				}
				remaining := ot - od
				if remaining > 0 && rate > 0 {
					eta := int(math.Ceil(float64(remaining) / rate))
					if eta > 0 {
						jp.EtaSeconds = &eta
					}
				}
			}
		}
		m.updateAndPublishProgress(jobID, jp)
	}

	m.writeJobLog(logFile, jobID, "info", "completed")
	return nil
}

func (m *Manager) writeJobLog(w io.Writer, jobID, level, message string) {
	_, _ = w.Write([]byte("[" + level + "] " + message + "\n"))
	m.hub.Publish(ws.Event{
		Type:  "job.log",
		JobID: jobID,
		Payload: map[string]any{
			"level":   level,
			"message": message,
		},
	})
	m.emitJobLogStdout(jobID, level, message)
}

func (m *Manager) emitJobLogStdout(jobID, level, message string) {
	if !m.logEmitStdout {
		return
	}
	logging.WriteJSONLineStdout(map[string]any{
		"ts":        time.Now().UTC().Format(time.RFC3339Nano),
		"event":     "job.log",
		"component": "job",
		"job_id":    jobID,
		"level":     level,
		"msg":       message,
	})
}

func (m *Manager) updateAndPublishProgress(jobID string, jp *models.JobProgress) {
	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil, nil)
	cancel()

	m.hub.Publish(ws.Event{
		Type:  "job.progress",
		JobID: jobID,
		Payload: map[string]any{
			"status":   models.JobStatusRunning,
			"progress": jp,
		},
	})
}

func trimEmpty(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		out = append(out, s)
	}
	return out
}

func int64Ptr(v int64) *int64 {
	p := v
	return &p
}

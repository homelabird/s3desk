package jobs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"object-storage/internal/models"
	"object-storage/internal/s3client"
	"object-storage/internal/ws"
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

	client, err := s3client.New(ctx, profileSecrets)
	if err != nil {
		return err
	}

	ot := int64(len(keys))
	startedAt := time.Now()
	m.updateAndPublishProgress(jobID, &models.JobProgress{ObjectsTotal: &ot, ObjectsDone: int64Ptr(0)})
	m.writeJobLog(logFile, jobID, "info", fmt.Sprintf("deleting %d object(s) from s3://%s", ot, bucket))

	const batchSize = 1000
	var (
		objectsDone  int64
		totalErrors  int
		loggedErrors int
	)

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

		ids := make([]types.ObjectIdentifier, 0, len(batch))
		for _, k := range batch {
			ids = append(ids, types.ObjectIdentifier{Key: aws.String(k)})
		}

		callCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		out, err := client.DeleteObjects(callCtx, &s3.DeleteObjectsInput{
			Bucket: aws.String(bucket),
			Delete: &types.Delete{Objects: ids, Quiet: aws.Bool(true)},
		})
		cancel()
		if err != nil {
			m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("DeleteObjects failed: %v", err))
			return err
		}

		errCount := len(out.Errors)
		totalErrors += errCount
		successes := len(ids) - errCount
		if successes < 0 {
			successes = 0
		}
		objectsDone += int64(successes)

		if errCount > 0 {
			for _, e := range out.Errors {
				if loggedErrors >= 20 {
					break
				}
				loggedErrors++
				m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("delete failed: key=%s code=%s message=%s", aws.ToString(e.Key), aws.ToString(e.Code), aws.ToString(e.Message)))
			}
		}

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

	if totalErrors > 0 {
		m.writeJobLog(logFile, jobID, "error", fmt.Sprintf("completed with %d error(s)", totalErrors))
		return fmt.Errorf("some objects failed to delete (%d error(s))", totalErrors)
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
}

func (m *Manager) updateAndPublishProgress(jobID string, jp *models.JobProgress) {
	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil)
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

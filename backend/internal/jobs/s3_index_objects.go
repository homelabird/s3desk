package jobs

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"object-storage/internal/models"
	"object-storage/internal/s3client"
	"object-storage/internal/store"
	"object-storage/internal/ws"
)

func (m *Manager) runS3IndexObjects(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	fullReindex := true
	if v, ok := payload["fullReindex"]; ok {
		if b, ok := v.(bool); ok {
			fullReindex = b
		}
	}

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}

	logPath := filepath.Join(m.dataDir, "logs", "jobs", jobID+".log")
	logWriter, err := openJobLogWriter(logPath, m.logMaxBytes)
	if err != nil {
		return err
	}
	defer func() { _ = logWriter.Close() }()

	writeLog := func(format string, args ...any) {
		_, _ = logWriter.Write([]byte(fmt.Sprintf(format, args...) + "\n"))
	}

	writeLog("Starting index: bucket=%q prefix=%q", bucket, prefix)

	if fullReindex {
		writeLog("Clearing existing index entries…")
		if err := m.store.ClearObjectIndex(ctx, profileID, bucket, prefix); err != nil {
			return err
		}
	}

	secrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("profile not found")
	}

	client, err := s3client.New(ctx, secrets)
	if err != nil {
		return err
	}

	indexedAt := time.Now().UTC().Format(time.RFC3339Nano)
	var (
		objectsDone int64
		bytesDone   int64
	)

	lastProgressFlush := time.Now()
	flushProgress := func(force bool) {
		if !force && time.Since(lastProgressFlush) < time.Second {
			return
		}
		lastProgressFlush = time.Now()

		od := objectsDone
		bd := bytesDone
		jp := &models.JobProgress{
			ObjectsDone: &od,
			BytesDone:   &bd,
		}

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

	batch := make([]store.ObjectIndexEntry, 0, 500)
	flushBatch := func() error {
		if len(batch) == 0 {
			return nil
		}
		if err := m.store.UpsertObjectIndexBatch(ctx, profileID, bucket, batch, indexedAt); err != nil {
			return err
		}
		batch = batch[:0]
		return nil
	}

	var token *string
	for {
		select {
		case <-ctx.Done():
			_ = flushBatch()
			flushProgress(true)
			return ctx.Err()
		default:
		}

		in := &s3.ListObjectsV2Input{
			Bucket:  aws.String(bucket),
			MaxKeys: aws.Int32(1000),
		}
		if prefix != "" {
			in.Prefix = aws.String(prefix)
		}
		if token != nil && *token != "" {
			in.ContinuationToken = token
		}

		out, err := client.ListObjectsV2(ctx, in)
		if err != nil {
			return err
		}

		for _, obj := range out.Contents {
			select {
			case <-ctx.Done():
				_ = flushBatch()
				flushProgress(true)
				return ctx.Err()
			default:
			}

			key := aws.ToString(obj.Key)
			if key == "" {
				continue
			}
			size := aws.ToInt64(obj.Size)

			entry := store.ObjectIndexEntry{
				Key:  key,
				Size: size,
			}
			if obj.ETag != nil {
				entry.ETag = aws.ToString(obj.ETag)
			}
			if obj.LastModified != nil {
				entry.LastModified = obj.LastModified.UTC().Format(time.RFC3339Nano)
			}
			batch = append(batch, entry)

			objectsDone++
			bytesDone += size

			if len(batch) >= 500 {
				if err := flushBatch(); err != nil {
					return err
				}
			}
			flushProgress(false)
		}

		if aws.ToBool(out.IsTruncated) && out.NextContinuationToken != nil && *out.NextContinuationToken != "" {
			token = out.NextContinuationToken
			continue
		}
		break
	}

	if err := flushBatch(); err != nil {
		return err
	}
	flushProgress(true)
	writeLog("Index complete: objects=%d bytes=%d indexedAt=%s", objectsDone, bytesDone, indexedAt)
	return nil
}


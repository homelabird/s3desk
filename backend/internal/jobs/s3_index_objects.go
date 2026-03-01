package jobs

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func (m *Manager) runS3IndexObjects(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseS3IndexObjectsPayload(payload)
	if err != nil {
		return err
	}

	bucket := strings.TrimSpace(parsed.Bucket)
	prefix := normalizeKeyInput(parsed.Prefix, preserveLeadingSlash)
	fullReindex := parsed.FullReindex

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
		msg := fmt.Sprintf(format, args...)
		_, _ = logWriter.Write([]byte(msg + "\n"))
		m.emitJobLogStdout(jobID, "info", msg)
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
		return ErrProfileNotFound
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

	args := []string{"lsjson", "-R", "--fast-list", "--no-mimetype", "--hash", rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)}
	proc, err := m.startRcloneCommand(ctx, secrets, jobID, args)
	if err != nil {
		return err
	}

	listErr := decodeRcloneList(proc.stdout, func(obj rcloneListEntry) error {
		select {
		case <-ctx.Done():
			_ = flushBatch()
			flushProgress(true)
			return ctx.Err()
		default:
		}
		if obj.IsDir {
			return nil
		}
		key := obj.Path
		if strings.TrimSpace(key) == "" && strings.TrimSpace(obj.Name) != "" {
			key = obj.Name
		}
		key = rcloneObjectKey(prefix, key, preserveLeadingSlash)
		if key == "" {
			return nil
		}
		size := obj.Size

		entry := store.ObjectIndexEntry{
			Key:  key,
			Size: size,
		}
		if etag := rcloneETagFromHashes(obj.Hashes); etag != "" {
			entry.ETag = etag
		}
		if lm := rcloneParseTime(obj.ModTime); lm != "" {
			entry.LastModified = lm
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
		return nil
	})

	waitErr := proc.wait()
	if errors.Is(listErr, errRcloneListStop) {
		listErr = nil
	}
	if listErr != nil {
		return listErr
	}
	if waitErr != nil {
		return jobErrorFromRclone(waitErr, proc.stderr.String(), "rclone lsjson")
	}

	if err := flushBatch(); err != nil {
		return err
	}
	flushProgress(true)
	writeLog("Index complete: objects=%d bytes=%d indexedAt=%s", objectsDone, bytesDone, indexedAt)
	return nil
}

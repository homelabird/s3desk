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
)

var errS3IndexObjectLimit = errors.New("object index object limit reached")

func (m *Manager) runS3IndexObjects(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	maxDuration := m.s3IndexMaxDuration
	if maxDuration <= 0 {
		maxDuration = defaultS3IndexMaxDuration
	}
	maxObjects := m.s3IndexMaxObjects
	if maxObjects <= 0 {
		maxObjects = defaultS3IndexMaxObjects
	}
	ctx, cancel := context.WithTimeout(ctx, maxDuration)
	defer cancel()

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
		_ = m.writeJobLog(logWriter, jobID, "info", msg)
	}

	writeLog("Starting index: bucket=%q prefix=%q", bucket, prefix)

	replacementID := jobID
	if err := m.store.DiscardObjectIndexReplacement(ctx, replacementID); err != nil {
		return err
	}
	cleanupCtx := context.WithoutCancel(ctx)
	defer func() {
		_ = m.store.DiscardObjectIndexReplacement(cleanupCtx, replacementID)
	}()

	secrets, ok, err := m.profileSecrets(ctx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrProfileNotFound
	}
	var scannedEntries int
	defer func() {
		if m.metrics != nil {
			m.metrics.AddStorageRcloneListEntriesScanned(string(secrets.Provider), "object_index", scannedEntries)
		}
	}()

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
		if err := m.persistAndPublishRunningProgress(jobID, jp); err != nil {
			m.logProgressPersistenceError(jobID, err)
		}
	}

	batch := make([]store.ObjectIndexEntry, 0, 500)
	flushBatch := func() error {
		if len(batch) == 0 {
			return nil
		}
		if err := m.store.StageObjectIndexReplacementBatch(ctx, replacementID, profileID, bucket, batch, indexedAt); err != nil {
			return err
		}
		batch = batch[:0]
		return nil
	}

	// Index results use provider LastModified and don't need hashes; avoid per-object metadata HEADs.
	args := []string{"lsjson", "-R", "--no-mimetype", "--use-server-modtime"}
	args = append(args, rcloneRemoteDir(bucket, prefix, preserveLeadingSlash))
	proc, err := m.startRcloneCommand(ctx, secrets, jobID, args)
	if err != nil {
		return err
	}

	listErr := decodeRcloneList(proc.stdout, func(obj rcloneListEntry) error {
		scannedEntries++
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
		if objectsDone >= maxObjects {
			cancel()
			return errS3IndexObjectLimit
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
	if errors.Is(listErr, errS3IndexObjectLimit) {
		return fmt.Errorf("object index scan exceeded OBJECT_INDEX_MAX_OBJECTS=%d", maxObjects)
	}
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
	if fullReindex {
		writeLog("Finalizing index replacement…")
		if err := m.store.FinalizeObjectIndexReplacement(ctx, replacementID, profileID, bucket, prefix); err != nil {
			return err
		}
	} else {
		if err := m.store.MergeObjectIndexReplacement(ctx, replacementID); err != nil {
			return err
		}
	}
	flushProgress(true)
	writeLog("Index complete: objects=%d bytes=%d indexedAt=%s", objectsDone, bytesDone, indexedAt)
	return nil
}

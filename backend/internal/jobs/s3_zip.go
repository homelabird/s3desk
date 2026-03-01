package jobs

import (
	"archive/zip"
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"

	"s3desk/internal/models"
)

type s3ZipObject struct {
	Key          string
	EntryName    string
	Size         int64
	LastModified *time.Time
}

const maxObjectsForZip = 50_000

func (m *Manager) runS3ZipPrefix(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseS3ZipPrefixPayload(payload)
	if err != nil {
		return err
	}

	bucket := strings.TrimSpace(parsed.Bucket)
	prefix := normalizeKeyInput(parsed.Prefix, preserveLeadingSlash)

	if bucket == "" {
		return errors.New("payload.bucket is required")
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
		return ErrProfileNotFound
	}

	objs, err := listRcloneZipObjectsForPrefix(ctx, m, profileSecrets, jobID, bucket, prefix, preserveLeadingSlash)
	if err != nil {
		return err
	}

	m.writeJobLog(logFile, jobID, "info", fmt.Sprintf("creating zip from s3://%s/%s", bucket, prefix))
	artifactName := defaultZipNameFromPrefix(bucket, prefix)
	return m.writeZipArtifact(ctx, jobID, logFile, artifactName, func(zw *zip.Writer, publish publishZipProgress) error {
		return zipS3Objects(ctx, m, profileSecrets, jobID, bucket, objs, zw, publish, preserveLeadingSlash)
	})
}

func (m *Manager) runS3ZipObjects(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseS3ZipObjectsPayload(payload)
	if err != nil {
		return err
	}

	bucket := strings.TrimSpace(parsed.Bucket)
	rawKeys := parsed.Keys
	stripPrefix := normalizeKeyInput(parsed.StripPrefix, preserveLeadingSlash)

	keys := trimEmpty(rawKeys)
	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if len(keys) == 0 {
		return errors.New("payload.keys must contain at least one key")
	}

	const maxKeys = 10_000
	if len(keys) > maxKeys {
		return fmt.Errorf("too many keys (%d > %d); use a prefix zip instead", len(keys), maxKeys)
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
		return ErrProfileNotFound
	}

	// Normalize + de-dupe keys.
	seen := make(map[string]struct{}, len(keys))
	normalized := make([]string, 0, len(keys))
	for _, k := range keys {
		k = normalizeKeyInput(k, preserveLeadingSlash)
		if k == "" {
			continue
		}
		if strings.ContainsRune(k, 0) {
			continue
		}
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		normalized = append(normalized, k)
	}
	sort.Strings(normalized)

	objs := make([]s3ZipObject, 0, len(normalized))
	for _, key := range normalized {
		entryName := key
		if stripPrefix != "" && strings.HasPrefix(key, stripPrefix) {
			entryName = strings.TrimPrefix(key, stripPrefix)
		}
		objs = append(objs, s3ZipObject{Key: key, EntryName: entryName})
	}

	entries, err := fetchRcloneEntriesForKeys(ctx, m, profileSecrets, jobID, bucket, normalized)
	if err != nil {
		return err
	}
	for i := range objs {
		entry, ok := entries[objs[i].Key]
		if !ok {
			continue
		}
		objs[i].Size = entry.Size
		if lm := rcloneParseTime(entry.ModTime); lm != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, lm); err == nil {
				tm := parsed.UTC()
				objs[i].LastModified = &tm
			}
		}
	}

	ot := int64(len(objs))
	m.updateAndPublishProgress(jobID, &models.JobProgress{ObjectsTotal: &ot, ObjectsDone: int64Ptr(0), BytesDone: int64Ptr(0)})

	m.writeJobLog(logFile, jobID, "info", fmt.Sprintf("creating zip from %d object(s) in s3://%s", ot, bucket))
	artifactName := defaultZipNameFromKeys(bucket, stripPrefix, objs)
	return m.writeZipArtifact(ctx, jobID, logFile, artifactName, func(zw *zip.Writer, publish publishZipProgress) error {
		return zipS3Objects(ctx, m, profileSecrets, jobID, bucket, objs, zw, publish, preserveLeadingSlash)
	})
}

type publishZipProgress func(objectsDone, objectsTotal, bytesDone, bytesTotal int64, startedAt time.Time, force bool)

func (m *Manager) writeZipArtifact(
	ctx context.Context,
	jobID string,
	logFile io.Writer,
	artifactName string,
	write func(zw *zip.Writer, publish publishZipProgress) error,
) error {
	artifactDir := filepath.Join(m.dataDir, "artifacts", "jobs")
	if err := os.MkdirAll(artifactDir, 0o700); err != nil {
		return err
	}
	finalPath := filepath.Join(artifactDir, jobID+".zip")
	tmpPath := filepath.Join(artifactDir, jobID+".zip.tmp")

	// Clean up any old temp artifacts (best-effort).
	_ = os.Remove(tmpPath)
	_ = os.Remove(finalPath)

	// #nosec G304 -- tmpPath is built from the configured data directory.
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	zw := zip.NewWriter(f)
	defer func() { _ = zw.Close() }()

	var (
		lastPublish time.Time
	)

	publish := func(objectsDone, objectsTotal, bytesDone, bytesTotal int64, startedAt time.Time, force bool) {
		now := time.Now()
		if !force && !lastPublish.IsZero() && now.Sub(lastPublish) < 800*time.Millisecond {
			return
		}
		lastPublish = now

		ot := objectsTotal
		od := objectsDone
		bd := bytesDone
		jp := &models.JobProgress{
			ObjectsDone: &od,
			BytesDone:   &bd,
		}
		if objectsTotal > 0 {
			jp.ObjectsTotal = &ot
		}
		if bytesTotal > 0 {
			bt := bytesTotal
			jp.BytesTotal = &bt
		}

		elapsed := now.Sub(startedAt).Seconds()
		if elapsed > 0 && bd > 0 {
			speed := int64(float64(bd) / elapsed)
			if speed > 0 {
				jp.SpeedBps = &speed
			}
			if bytesTotal > 0 {
				remaining := bytesTotal - bd
				if remaining > 0 && speed > 0 {
					eta := int(float64(remaining) / float64(speed))
					if eta > 0 {
						jp.EtaSeconds = &eta
					}
				}
			}
		}
		if elapsed > 0 && od > 0 {
			ops := int64(float64(od) / elapsed)
			if ops > 0 {
				jp.ObjectsPerSecond = &ops
			}
		}

		m.updateAndPublishProgress(jobID, jp)
	}

	if err := write(zw, publish); err != nil {
		_ = zw.Close()
		_ = f.Close()
		_ = os.Remove(tmpPath)
		_ = os.Remove(finalPath)
		return err
	}

	if err := zw.Close(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		_ = os.Remove(finalPath)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		_ = os.Remove(finalPath)
		return err
	}

	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		_ = os.Remove(finalPath)
		return err
	}

	if artifactName != "" {
		m.writeJobLog(logFile, jobID, "info", fmt.Sprintf("artifact ready: %s", artifactName))
	} else {
		m.writeJobLog(logFile, jobID, "info", "artifact ready")
	}
	return nil
}

func listRcloneZipObjectsForPrefix(ctx context.Context, m *Manager, profile models.ProfileSecrets, jobID, bucket, prefix string, preserveLeadingSlash bool) ([]s3ZipObject, error) {
	args := []string{"lsjson", "-R", "--fast-list", "--no-mimetype", rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)}
	proc, err := m.startRcloneCommand(ctx, profile, jobID, args)
	if err != nil {
		return nil, err
	}

	objs := make([]s3ZipObject, 0, 1024)
	listErr := decodeRcloneList(proc.stdout, func(obj rcloneListEntry) error {
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
		if obj.Size == 0 && strings.HasSuffix(key, "/") {
			return nil
		}
		entryName := key
		if prefix != "" && strings.HasPrefix(key, prefix) {
			entryName = strings.TrimPrefix(key, prefix)
		}
		if strings.TrimSpace(entryName) == "" {
			return nil
		}
		if int64(len(objs)) >= maxObjectsForZip {
			return fmt.Errorf("too many objects to zip (>%d); narrow the prefix", maxObjectsForZip)
		}

		var lm *time.Time
		if ts := rcloneParseTime(obj.ModTime); ts != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, ts); err == nil {
				tm := parsed.UTC()
				lm = &tm
			}
		}

		objs = append(objs, s3ZipObject{
			Key:          key,
			EntryName:    entryName,
			Size:         obj.Size,
			LastModified: lm,
		})
		return nil
	})
	waitErr := proc.wait()
	if listErr != nil {
		return nil, listErr
	}
	if waitErr != nil {
		return nil, jobErrorFromRclone(waitErr, proc.stderr.String(), "rclone lsjson")
	}

	return objs, nil
}

func fetchRcloneEntriesForKeys(ctx context.Context, m *Manager, profile models.ProfileSecrets, jobID, bucket string, keys []string) (map[string]rcloneListEntry, error) {
	entries := make(map[string]rcloneListEntry, len(keys))
	if len(keys) == 0 {
		return entries, nil
	}

	tmpFile, err := os.CreateTemp("", "rclone-zip-keys-*.txt")
	if err != nil {
		return nil, err
	}
	tmpPath := tmpFile.Name()
	defer func() { _ = os.Remove(tmpPath) }()

	writer := bufio.NewWriter(tmpFile)
	for _, key := range keys {
		if _, err := writer.WriteString(key + "\n"); err != nil {
			_ = tmpFile.Close()
			return nil, err
		}
	}
	if err := writer.Flush(); err != nil {
		_ = tmpFile.Close()
		return nil, err
	}
	if err := tmpFile.Close(); err != nil {
		return nil, err
	}

	args := []string{"lsjson", "--files-only", "--no-mimetype", "--files-from-raw", tmpPath, rcloneRemoteBucket(bucket)}
	proc, err := m.startRcloneCommand(ctx, profile, jobID, args)
	if err != nil {
		return nil, err
	}

	listErr := decodeRcloneList(proc.stdout, func(entry rcloneListEntry) error {
		key := entry.Path
		if strings.TrimSpace(key) == "" && strings.TrimSpace(entry.Name) != "" {
			key = entry.Name
		}
		if key == "" {
			return nil
		}
		entries[key] = entry
		return nil
	})
	waitErr := proc.wait()
	if listErr != nil {
		return nil, listErr
	}
	if waitErr != nil {
		return nil, jobErrorFromRclone(waitErr, proc.stderr.String(), "rclone lsjson")
	}

	return entries, nil
}

func zipS3Objects(ctx context.Context, m *Manager, profile models.ProfileSecrets, jobID, bucket string, objs []s3ZipObject, zw *zip.Writer, publish publishZipProgress, preserveLeadingSlash bool) error {
	startedAt := time.Now()
	var (
		objectsDone int64
		bytesDone   int64
		bytesTotal  int64
	)

	objectsTotal := int64(len(objs))
	for _, o := range objs {
		bytesTotal += o.Size
	}

	usedNames := make(map[string]struct{}, len(objs))
	buf := make([]byte, 256*1024)

	for _, obj := range objs {
		if err := zipS3Object(ctx, m, profile, jobID, bucket, obj, zw, usedNames, buf, publish, startedAt, &objectsDone, &bytesDone, objectsTotal, bytesTotal, preserveLeadingSlash); err != nil {
			return err
		}
	}

	publish(objectsDone, objectsTotal, bytesDone, bytesTotal, startedAt, true)
	return nil
}

func zipS3Object(
	ctx context.Context,
	m *Manager,
	profile models.ProfileSecrets,
	jobID string,
	bucket string,
	obj s3ZipObject,
	zw *zip.Writer,
	usedNames map[string]struct{},
	buf []byte,
	publish publishZipProgress,
	startedAt time.Time,
	objectsDone *int64,
	bytesDone *int64,
	objectsTotal int64,
	bytesTotal int64,
	preserveLeadingSlash bool,
) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	entryName, err := sanitizeZipEntryName(obj.EntryName)
	if err != nil {
		return fmt.Errorf("unsafe zip entry name for key %q: %v", obj.Key, err)
	}
	entryName = uniqueZipEntryName(usedNames, entryName)

	h := &zip.FileHeader{
		Name:   entryName,
		Method: zip.Store,
	}
	if obj.LastModified != nil {
		h.Modified = *obj.LastModified
	} else {
		h.Modified = time.Now()
	}

	w, err := zw.CreateHeader(h)
	if err != nil {
		return err
	}

	proc, err := m.startRcloneCommand(ctx, profile, jobID, []string{"cat", rcloneRemoteObject(bucket, obj.Key, preserveLeadingSlash)})
	if err != nil {
		return err
	}

	n, copyErr := copyWithContext(ctx, w, proc.stdout, buf, func(delta int64) {
		*bytesDone += delta
		publish(*objectsDone, objectsTotal, *bytesDone, bytesTotal, startedAt, false)
	})
	waitErr := proc.wait()
	if copyErr != nil {
		return copyErr
	}
	if waitErr != nil {
		return jobErrorFromRclone(waitErr, proc.stderr.String(), "rclone cat")
	}
	_ = n

	*objectsDone++
	publish(*objectsDone, objectsTotal, *bytesDone, bytesTotal, startedAt, true)
	return nil
}

func copyWithContext(ctx context.Context, dst io.Writer, src io.Reader, buf []byte, onDelta func(delta int64)) (int64, error) {
	if len(buf) == 0 {
		buf = make([]byte, 256*1024)
	}
	var total int64
	for {
		select {
		case <-ctx.Done():
			return total, ctx.Err()
		default:
		}

		n, rerr := src.Read(buf)
		if n > 0 {
			wn, werr := dst.Write(buf[:n])
			if werr != nil {
				return total, werr
			}
			if wn != n {
				return total, io.ErrShortWrite
			}
			total += int64(n)
			if onDelta != nil {
				onDelta(int64(n))
			}
		}
		if rerr != nil {
			if errors.Is(rerr, io.EOF) {
				return total, nil
			}
			return total, rerr
		}
	}
}

func sanitizeZipEntryName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("empty")
	}
	name = strings.ReplaceAll(name, "\\", "/")
	name = strings.TrimLeft(name, "/")
	if strings.ContainsRune(name, 0) {
		return "", errors.New("null")
	}

	clean := path.Clean(name)
	if clean == "." || clean == ".." || clean == "" {
		return "", errors.New("invalid")
	}
	if strings.HasPrefix(clean, "../") {
		return "", errors.New("traversal")
	}

	parts := strings.Split(clean, "/")
	for _, p := range parts {
		if p == "" || p == "." || p == ".." {
			return "", errors.New("invalid segment")
		}
	}
	return clean, nil
}

func uniqueZipEntryName(used map[string]struct{}, name string) string {
	if _, ok := used[name]; !ok {
		used[name] = struct{}{}
		return name
	}

	ext := path.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 2; i < 10_000; i++ {
		candidate := fmt.Sprintf("%s-%d%s", base, i, ext)
		if _, ok := used[candidate]; ok {
			continue
		}
		used[candidate] = struct{}{}
		return candidate
	}

	used[name] = struct{}{}
	return name
}

func defaultZipNameFromPrefix(bucket, prefix string) string {
	bucket = strings.TrimSpace(bucket)
	prefix = strings.Trim(strings.TrimPrefix(strings.TrimSpace(prefix), "/"), "/")
	if bucket == "" {
		return "download.zip"
	}
	if prefix == "" {
		return safeZipFilename(bucket) + ".zip"
	}
	return safeZipFilename(bucket+"-"+prefix) + ".zip"
}

func defaultZipNameFromKeys(bucket, stripPrefix string, objs []s3ZipObject) string {
	bucket = strings.TrimSpace(bucket)
	stripPrefix = strings.Trim(strings.TrimPrefix(strings.TrimSpace(stripPrefix), "/"), "/")
	if bucket == "" {
		return "download.zip"
	}
	if stripPrefix != "" {
		return safeZipFilename(bucket+"-"+stripPrefix) + ".zip"
	}
	if len(objs) == 1 {
		return safeZipFilename(bucket+"-"+path.Base(objs[0].Key)) + ".zip"
	}
	return safeZipFilename(bucket+"-selection") + ".zip"
}

func safeZipFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "download"
	}

	var b strings.Builder
	b.Grow(len(value))
	for _, r := range value {
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
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

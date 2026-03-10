package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	stddraw "image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	_ "golang.org/x/image/bmp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	"s3desk/internal/models"
)

const (
	thumbnailDefaultSize           = 96
	thumbnailMinSize               = 24
	thumbnailMaxSize               = 512
	thumbnailImageMaxBytes         = 25 * 1024 * 1024
	thumbnailVideoFullStreamBytes  = 256 * 1024 * 1024
	thumbnailVideoPartialTinyBytes = 8 * 1024 * 1024
	thumbnailVideoPartialMinBytes  = 32 * 1024 * 1024
	thumbnailVideoPartialMidBytes  = 64 * 1024 * 1024
	thumbnailVideoPartialMaxBytes  = 128 * 1024 * 1024
	thumbnailCacheTTL              = 24 * time.Hour
)

var errFFmpegNotFound = errors.New("ffmpeg not found in PATH (or set FFMPEG_PATH)")

type thumbnailByteRange struct {
	Offset int64
	Count  int64
}

type thumbnailVideoAttempt struct {
	Stream      string
	Offset      int64
	StreamBytes int64
	Ranges      []thumbnailByteRange
	Error       string
}

type thumbnailVideoFetchError struct {
	err    error
	stderr string
}

type thumbnailImageFetchError struct {
	err    error
	stderr string
}

type thumbnailManifestEntry struct {
	Fingerprint string `json:"fingerprint"`
	CachePath   string `json:"cachePath"`
}

func (e *thumbnailVideoFetchError) Error() string {
	return e.err.Error()
}

func (e *thumbnailVideoFetchError) Unwrap() error {
	return e.err
}

func (e *thumbnailImageFetchError) Error() string {
	return e.err.Error()
}

func (e *thumbnailImageFetchError) Unwrap() error {
	return e.err
}

func (s *server) handleGetObjectThumbnail(w http.ResponseWriter, r *http.Request) {
	metric := s.beginStorageMetric("unknown", "get_object_thumbnail")
	defer metric.Observe()

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	key := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("key")), "/")
	if bucket == "" || key == "" {
		metric.SetStatus("invalid_request")
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
		return
	}

	size := parseThumbnailSize(r.URL.Query().Get("size"))
	if cacheHitSource, ok := tryServeThumbnailBeforeStat(s, w, r, secrets.ID, bucket, key, size); ok {
		if s.metrics != nil {
			s.metrics.IncThumbnailCacheHit(cacheHitSource)
		}
		metric.SetStatus("cache_hit")
		return
	}
	entry, stderr, err := s.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, false, "thumbnail-meta")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		metric.SetStatus("remote_error")
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to get object metadata",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	kind := thumbnailObjectKind(entry.MimeType, key)
	if kind == "" {
		metric.SetStatus("unsupported")
		writeError(w, http.StatusUnsupportedMediaType, "unsupported", "thumbnail not supported for this object", map[string]any{
			"key":      key,
			"mimeType": entry.MimeType,
			"size":     entry.Size,
		})
		return
	}
	maxBytes := thumbnailMaxBytesForKind(kind)
	if maxBytes > 0 && entry.Size > maxBytes {
		metric.SetStatus("too_large")
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "object is too large for thumbnail", map[string]any{
			"kind":     kind,
			"maxBytes": maxBytes,
			"size":     entry.Size,
		})
		return
	}

	cachePath := thumbnailCachePath(s.cfg.DataDir, secrets.ID, bucket, key, size, thumbnailObjectFingerprint(entry))
	if serveCachedThumbnail(w, r, cachePath) {
		_ = writeThumbnailManifest(s.cfg.DataDir, secrets.ID, bucket, key, size, thumbnailManifestEntry{
			Fingerprint: thumbnailObjectFingerprint(entry),
			CachePath:   cachePath,
		})
		if s.metrics != nil {
			s.metrics.IncThumbnailCacheHit("post_stat")
		}
		metric.SetStatus("cache_hit")
		return
	}

	ffmpegPath := ""
	if kind == "video" {
		ffmpegPath, err = resolveFFmpegPath()
		if err != nil {
			metric.SetStatus("thumbnail_engine_missing")
			writeError(
				w,
				http.StatusBadRequest,
				"thumbnail_engine_missing",
				"ffmpeg is required to fetch video thumbnails (install it or set FFMPEG_PATH)",
				map[string]any{"key": key},
			)
			return
		}
	}

	var img image.Image
	switch kind {
	case "image":
		img, err = s.loadThumbnailSourceImage(r.Context(), secrets, bucket, key)
		if err != nil {
			var fetchErr *thumbnailImageFetchError
			if errors.As(err, &fetchErr) {
				metric.SetStatus("remote_error")
				writeRcloneAPIError(w, fetchErr.err, fetchErr.stderr, rcloneAPIErrorContext{
					MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
					DefaultStatus:  http.StatusBadRequest,
					DefaultCode:    "s3_error",
					DefaultMessage: "failed to download object",
				}, map[string]any{"bucket": bucket, "key": key})
				return
			}
			metric.SetStatus("unsupported")
			writeError(w, http.StatusUnsupportedMediaType, "unsupported", "failed to decode thumbnail source", map[string]any{
				"key":      key,
				"kind":     kind,
				"decoder":  "image.Decode",
				"mimeType": entry.MimeType,
				"size":     entry.Size,
				"error":    err.Error(),
			})
			return
		}
	case "video":
		var attempts []thumbnailVideoAttempt
		img, attempts, err = s.decodeThumbnailVideoWithFallbacks(r.Context(), secrets, bucket, key, entry.Size, ffmpegPath)
		if err != nil {
			var fetchErr *thumbnailVideoFetchError
			if errors.As(err, &fetchErr) {
				metric.SetStatus("remote_error")
				writeRcloneAPIError(w, fetchErr.err, fetchErr.stderr, rcloneAPIErrorContext{
					MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
					DefaultStatus:  http.StatusBadRequest,
					DefaultCode:    "s3_error",
					DefaultMessage: "failed to download object",
				}, map[string]any{"bucket": bucket, "key": key})
				return
			}
			metric.SetStatus("unsupported")
			details := map[string]any{
				"key":      key,
				"kind":     kind,
				"decoder":  "ffmpeg",
				"mimeType": entry.MimeType,
				"size":     entry.Size,
				"error":    err.Error(),
			}
			if len(attempts) > 0 {
				details["attempts"] = thumbnailVideoAttemptsDetails(attempts)
				last := attempts[len(attempts)-1]
				details["stream"] = last.Stream
				details["streamBytes"] = last.StreamBytes
			}
			writeError(w, http.StatusUnsupportedMediaType, "unsupported", "failed to extract video thumbnail frame", details)
			return
		}
	default:
		err = errors.New("unsupported thumbnail kind")
		metric.SetStatus("unsupported")
		writeError(w, http.StatusUnsupportedMediaType, "unsupported", err.Error(), map[string]any{"key": key})
		return
	}

	thumb := resizeForThumbnail(img, size)
	if err := writeThumbnailFile(cachePath, thumb); err != nil {
		metric.SetStatus("internal_error")
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to store thumbnail", map[string]any{"error": err.Error()})
		return
	}
	_ = writeThumbnailManifest(s.cfg.DataDir, secrets.ID, bucket, key, size, thumbnailManifestEntry{
		Fingerprint: thumbnailObjectFingerprint(entry),
		CachePath:   cachePath,
	})

	metric.SetStatus("success")
	_ = serveCachedThumbnail(w, r, cachePath)
}

func tryServeThumbnailBeforeStat(s *server, w http.ResponseWriter, r *http.Request, profileID, bucket, key string, size int) (string, bool) {
	requestFingerprintCachePath, hasRequestFingerprint := thumbnailRequestFingerprintCachePath(s.cfg.DataDir, profileID, bucket, key, size, r)
	if hasRequestFingerprint && serveCachedThumbnail(w, r, requestFingerprintCachePath) {
		return "request_fingerprint", true
	}
	if hasRequestFingerprint {
		return "", false
	}
	if cachePath, ok := loadThumbnailManifestPath(s.cfg.DataDir, profileID, bucket, key, size); ok {
		if serveCachedThumbnail(w, r, cachePath) {
			return "manifest", true
		}
	}
	return "", false
}

func parseThumbnailSize(raw string) int {
	if raw == "" {
		return thumbnailDefaultSize
	}
	if parsed, err := strconv.Atoi(raw); err == nil {
		if parsed < thumbnailMinSize {
			return thumbnailMinSize
		}
		if parsed > thumbnailMaxSize {
			return thumbnailMaxSize
		}
		return parsed
	}
	return thumbnailDefaultSize
}

func thumbnailObjectKind(contentType, key string) string {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if strings.HasPrefix(ct, "image/") && ct != "image/svg+xml" {
		return "image"
	}
	if strings.HasPrefix(ct, "video/") {
		return "video"
	}
	ext := strings.TrimPrefix(strings.ToLower(path.Ext(key)), ".")
	switch ext {
	case "jpg", "jpeg", "png", "gif", "webp", "bmp":
		return "image"
	case "mp4", "mov", "m4v", "webm", "mkv", "avi":
		return "video"
	default:
		return ""
	}
}

func decodeThumbnailImage(r io.Reader) (image.Image, error) {
	limited := io.LimitReader(r, thumbnailImageMaxBytes+1)
	img, _, err := image.Decode(limited)
	if err != nil {
		return nil, err
	}
	return img, nil
}

func (s *server) loadThumbnailSourceImage(
	ctx context.Context,
	secrets models.ProfileSecrets,
	bucket string,
	key string,
) (image.Image, error) {
	source, err := s.readThumbnailSourceBytes(ctx, secrets, bucket, key)
	if err != nil {
		return nil, err
	}
	return decodeThumbnailImage(bytes.NewReader(source))
}

func (s *server) readThumbnailSourceBytes(
	ctx context.Context,
	secrets models.ProfileSecrets,
	bucket string,
	key string,
) ([]byte, error) {
	proc, startErr := s.startRclone(ctx, secrets, []string{"cat", rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)}, "thumbnail")
	if startErr != nil {
		return nil, &thumbnailImageFetchError{err: startErr}
	}
	source, readErr := io.ReadAll(io.LimitReader(proc.stdout, thumbnailImageMaxBytes+1))
	waitErr := proc.wait()
	if readErr != nil {
		return nil, &thumbnailImageFetchError{err: readErr, stderr: proc.stderr.String()}
	}
	if waitErr != nil {
		return nil, &thumbnailImageFetchError{err: waitErr, stderr: proc.stderr.String()}
	}
	return source, nil
}

func thumbnailMaxBytesForKind(kind string) int64 {
	if kind == "image" {
		return thumbnailImageMaxBytes
	}
	return 0
}

func (s *server) decodeThumbnailVideoWithFallbacks(
	ctx context.Context,
	secrets models.ProfileSecrets,
	bucket string,
	key string,
	size int64,
	ffmpegPath string,
) (image.Image, []thumbnailVideoAttempt, error) {
	if size <= 0 || size <= thumbnailVideoFullStreamBytes {
		img, attempt, err := s.decodeThumbnailVideoStreamAttempt(ctx, secrets, bucket, key, ffmpegPath, "full", 0, 0)
		return img, []thumbnailVideoAttempt{attempt}, err
	}

	attempts := make([]thumbnailVideoAttempt, 0, 3)
	for _, count := range thumbnailVideoPartialPlan(size) {
		img, attempt, err := s.decodeThumbnailVideoStreamAttempt(ctx, secrets, bucket, key, ffmpegPath, "range_head", 0, count)
		attempts = append(attempts, attempt)
		if err == nil {
			return img, attempts, nil
		}
		var fetchErr *thumbnailVideoFetchError
		if errors.As(err, &fetchErr) {
			return nil, attempts, err
		}

		tailOffset := size - count
		if tailOffset < 0 {
			tailOffset = 0
		}
		img, attempt, err = s.decodeThumbnailVideoStreamAttempt(ctx, secrets, bucket, key, ffmpegPath, "range_tail", tailOffset, count)
		attempts = append(attempts, attempt)
		if err == nil {
			return img, attempts, nil
		}
		if errors.As(err, &fetchErr) {
			return nil, attempts, err
		}

		img, attempt, err = s.decodeThumbnailVideoSparseAttempt(ctx, secrets, bucket, key, size, ffmpegPath, count)
		attempts = append(attempts, attempt)
		if err == nil {
			return img, attempts, nil
		}
		if errors.As(err, &fetchErr) {
			return nil, attempts, err
		}
	}
	return nil, attempts, errors.New("failed to extract thumbnail from available video ranges")
}

func (s *server) decodeThumbnailVideoStreamAttempt(
	ctx context.Context,
	secrets models.ProfileSecrets,
	bucket string,
	key string,
	ffmpegPath string,
	stream string,
	offset int64,
	count int64,
) (image.Image, thumbnailVideoAttempt, error) {
	attempt := thumbnailVideoAttempt{
		Stream:      stream,
		Offset:      offset,
		StreamBytes: count,
	}

	remote := rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)
	args := []string{"cat"}
	if count > 0 {
		args = append(args, "--offset", strconv.FormatInt(offset, 10), "--count", strconv.FormatInt(count, 10))
	}
	args = append(args, remote)

	downloadCtx, cancelDownload := context.WithCancel(ctx)
	defer cancelDownload()

	proc, err := s.startRclone(downloadCtx, secrets, args, "thumbnail")
	if err != nil {
		return nil, attempt, &thumbnailVideoFetchError{err: err}
	}

	img, decodeErr := decodeThumbnailVideoFrame(ctx, ffmpegPath, proc.stdout)
	if decodeErr == nil {
		cancelDownload()
		_ = proc.wait()
		return img, attempt, nil
	}

	waitErr := proc.wait()
	if waitErr != nil {
		attempt.Error = decodeErr.Error()
		return nil, attempt, decodeErr
	}

	attempt.Error = decodeErr.Error()
	return nil, attempt, decodeErr
}

func (s *server) decodeThumbnailVideoSparseAttempt(
	ctx context.Context,
	secrets models.ProfileSecrets,
	bucket string,
	key string,
	size int64,
	ffmpegPath string,
	count int64,
) (image.Image, thumbnailVideoAttempt, error) {
	ranges := thumbnailVideoSparseRanges(size, count)
	attempt := thumbnailVideoAttempt{
		Stream: "sparse_file",
		Ranges: ranges,
	}
	for _, r := range ranges {
		attempt.StreamBytes += r.Count
	}

	tmp, err := os.CreateTemp("", "s3desk-video-thumb-*.bin")
	if err != nil {
		attempt.Error = err.Error()
		return nil, attempt, err
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
	}()

	if err := tmp.Truncate(size); err != nil {
		attempt.Error = err.Error()
		return nil, attempt, err
	}
	for _, r := range ranges {
		if err := s.copyThumbnailObjectRange(ctx, secrets, bucket, key, r.Offset, r.Count, tmp); err != nil {
			attempt.Error = err.Error()
			return nil, attempt, err
		}
	}
	if err := tmp.Close(); err != nil {
		attempt.Error = err.Error()
		return nil, attempt, err
	}

	img, err := decodeThumbnailVideoFrameFile(ctx, ffmpegPath, tmpPath)
	if err != nil {
		attempt.Error = err.Error()
		return nil, attempt, err
	}
	return img, attempt, nil
}

func (s *server) copyThumbnailObjectRange(
	ctx context.Context,
	secrets models.ProfileSecrets,
	bucket string,
	key string,
	offset int64,
	count int64,
	dst *os.File,
) error {
	if count <= 0 {
		return nil
	}
	if _, err := dst.Seek(offset, io.SeekStart); err != nil {
		return err
	}

	args := []string{
		"cat",
		"--offset", strconv.FormatInt(offset, 10),
		"--count", strconv.FormatInt(count, 10),
		rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash),
	}
	proc, err := s.startRclone(ctx, secrets, args, "thumbnail")
	if err != nil {
		return &thumbnailVideoFetchError{err: err}
	}

	_, copyErr := io.Copy(dst, proc.stdout)
	waitErr := proc.wait()
	if copyErr != nil {
		return copyErr
	}
	if waitErr != nil {
		return &thumbnailVideoFetchError{err: waitErr, stderr: proc.stderr.String()}
	}
	return nil
}

func thumbnailVideoSparseRanges(size int64, count int64) []thumbnailByteRange {
	if size <= 0 {
		return nil
	}
	headCount := size
	if count > 0 && headCount > count {
		headCount = count
	}
	tailOffset := size - headCount
	if tailOffset < 0 {
		tailOffset = 0
	}
	if tailOffset == 0 {
		return []thumbnailByteRange{{Offset: 0, Count: headCount}}
	}
	return []thumbnailByteRange{
		{Offset: 0, Count: headCount},
		{Offset: tailOffset, Count: headCount},
	}
}

func thumbnailVideoPartialPlan(size int64) []int64 {
	if size <= 0 {
		return []int64{thumbnailVideoPartialMinBytes}
	}
	candidates := []int64{
		thumbnailVideoPartialTinyBytes,
		thumbnailVideoPartialMinBytes,
		thumbnailVideoPartialMidBytes,
		thumbnailVideoPartialMaxBytes,
	}
	plan := make([]int64, 0, len(candidates))
	var last int64 = -1
	for _, candidate := range candidates {
		count := candidate
		if size < count {
			count = size
		}
		if count <= 0 || count == last {
			continue
		}
		plan = append(plan, count)
		last = count
	}
	if len(plan) == 0 {
		return []int64{size}
	}
	return plan
}

func thumbnailVideoAttemptsDetails(attempts []thumbnailVideoAttempt) []map[string]any {
	if len(attempts) == 0 {
		return nil
	}
	details := make([]map[string]any, 0, len(attempts))
	for _, attempt := range attempts {
		item := map[string]any{
			"stream":      attempt.Stream,
			"streamBytes": attempt.StreamBytes,
		}
		if attempt.Offset > 0 {
			item["offset"] = attempt.Offset
		}
		if len(attempt.Ranges) > 0 {
			ranges := make([]map[string]any, 0, len(attempt.Ranges))
			for _, r := range attempt.Ranges {
				ranges = append(ranges, map[string]any{
					"offset": r.Offset,
					"count":  r.Count,
				})
			}
			item["ranges"] = ranges
		}
		if attempt.Error != "" {
			item["error"] = attempt.Error
		}
		details = append(details, item)
	}
	return details
}

func decodeThumbnailVideoFrame(ctx context.Context, ffmpegPath string, r io.Reader) (image.Image, error) {
	if decodeThumbnailVideoHook != nil {
		return decodeThumbnailVideoHook(ctx, ffmpegPath, r)
	}
	cmd := exec.CommandContext(
		ctx,
		ffmpegPath,
		"-hide_banner",
		"-loglevel", "error",
		"-i", "pipe:0",
		"-vf", "thumbnail",
		"-frames:v", "1",
		"-f", "image2pipe",
		"-vcodec", "png",
		"pipe:1",
	)
	cmd.Stdin = r

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	out, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg != "" {
			return nil, errors.New(msg)
		}
		return nil, err
	}
	if len(out) == 0 {
		return nil, errors.New("ffmpeg returned empty frame output")
	}
	img, _, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		return nil, err
	}
	return img, nil
}

func decodeThumbnailVideoFrameFile(ctx context.Context, ffmpegPath string, filePath string) (image.Image, error) {
	if decodeThumbnailVideoFileHook != nil {
		return decodeThumbnailVideoFileHook(ctx, ffmpegPath, filePath)
	}
	cmd := exec.CommandContext(
		ctx,
		ffmpegPath,
		"-hide_banner",
		"-loglevel", "error",
		"-i", filePath,
		"-vf", "thumbnail",
		"-frames:v", "1",
		"-f", "image2pipe",
		"-vcodec", "png",
		"pipe:1",
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	out, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg != "" {
			return nil, errors.New(msg)
		}
		return nil, err
	}
	if len(out) == 0 {
		return nil, errors.New("ffmpeg returned empty frame output")
	}
	img, _, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		return nil, err
	}
	return img, nil
}

func resolveFFmpegPath() (string, error) {
	if resolveFFmpegPathHook != nil {
		return resolveFFmpegPathHook()
	}
	ffmpegPath := strings.TrimSpace(os.Getenv("FFMPEG_PATH"))
	if ffmpegPath == "" {
		p, err := exec.LookPath("ffmpeg")
		if err != nil {
			return "", errFFmpegNotFound
		}
		return p, nil
	}
	if _, err := os.Stat(ffmpegPath); err != nil {
		return "", fmt.Errorf("invalid FFMPEG_PATH %q: %w", ffmpegPath, err)
	}
	return ffmpegPath, nil
}

func resizeForThumbnail(src image.Image, size int) image.Image {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return src
	}
	scale := 1.0
	if width > size || height > size {
		scale = math.Min(float64(size)/float64(width), float64(size)/float64(height))
	}
	dstW := int(math.Max(1, math.Round(float64(width)*scale)))
	dstH := int(math.Max(1, math.Round(float64(height)*scale)))

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	stddraw.Draw(dst, dst.Bounds(), &image.Uniform{C: color.White}, image.Point{}, stddraw.Src)
	if scale == 1.0 {
		stddraw.Draw(dst, dst.Bounds(), src, bounds.Min, stddraw.Over)
	} else {
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, xdraw.Over, nil)
	}
	return dst
}

func thumbnailObjectFingerprint(entry rcloneListEntry) string {
	return thumbnailFingerprintFromValues(
		entry.Size,
		rcloneETagFromHashes(entry.Hashes),
		rcloneParseTime(entry.ModTime),
		entry.MimeType,
	)
}

func thumbnailFingerprintFromValues(size int64, etag, lastModified, mimeType string) string {
	parts := []string{fmt.Sprintf("v2:size=%d", size)}
	if etag = strings.TrimSpace(etag); etag != "" {
		parts = append(parts, "etag="+etag)
	}
	if lastModified = rcloneParseTime(lastModified); lastModified != "" {
		parts = append(parts, "lastModified="+lastModified)
	}
	if mimeType = strings.ToLower(strings.TrimSpace(mimeType)); mimeType != "" {
		parts = append(parts, "mimeType="+mimeType)
	}
	return strings.Join(parts, "|")
}

func thumbnailCachePath(baseDir, profileID, bucket, key string, size int, fingerprint string) string {
	sum := sha256.Sum256([]byte(profileID + "\n" + bucket + "\n" + key + "\n" + strings.TrimSpace(fingerprint)))
	hexSum := hex.EncodeToString(sum[:])
	dir := filepath.Join(baseDir, "thumbnails", profileID, hexSum[:2])
	name := fmt.Sprintf("%s_%d.jpg", hexSum, size)
	return filepath.Join(dir, name)
}

func thumbnailManifestPath(baseDir, profileID, bucket, key string, size int) string {
	sum := sha256.Sum256([]byte(profileID + "\n" + bucket + "\n" + key + "\n" + strconv.Itoa(size)))
	hexSum := hex.EncodeToString(sum[:])
	dir := filepath.Join(baseDir, "thumbnails", "manifests", profileID, hexSum[:2])
	return filepath.Join(dir, fmt.Sprintf("%s.json", hexSum))
}

func loadThumbnailManifestPath(baseDir, profileID, bucket, key string, size int) (string, bool) {
	manifestPath := thumbnailManifestPath(baseDir, profileID, bucket, key, size)
	info, err := os.Stat(manifestPath)
	if err != nil || info.IsDir() || time.Since(info.ModTime()) > thumbnailCacheTTL {
		return "", false
	}
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		return "", false
	}
	var entry thumbnailManifestEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		return "", false
	}
	if strings.TrimSpace(entry.CachePath) == "" {
		return "", false
	}
	return entry.CachePath, true
}

func writeThumbnailManifest(baseDir, profileID, bucket, key string, size int, entry thumbnailManifestEntry) error {
	manifestPath := thumbnailManifestPath(baseDir, profileID, bucket, key, size)
	if err := os.MkdirAll(filepath.Dir(manifestPath), 0o750); err != nil {
		return err
	}
	payload, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(manifestPath), "manifest-*.json")
	if err != nil {
		return err
	}
	defer func() {
		_ = os.Remove(tmp.Name())
	}()
	if _, err := tmp.Write(payload); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), manifestPath)
}

func thumbnailRequestFingerprintCachePath(baseDir, profileID, bucket, key string, size int, r *http.Request) (string, bool) {
	sizeRaw := strings.TrimSpace(r.URL.Query().Get("objectSize"))
	if sizeRaw == "" {
		return "", false
	}
	objectSize, err := strconv.ParseInt(sizeRaw, 10, 64)
	if err != nil || objectSize < 0 {
		return "", false
	}
	etag := strings.TrimSpace(r.URL.Query().Get("etag"))
	lastModified := strings.TrimSpace(r.URL.Query().Get("lastModified"))
	contentType := strings.TrimSpace(r.URL.Query().Get("contentType"))
	if etag == "" && lastModified == "" && contentType == "" {
		return "", false
	}
	fingerprint := thumbnailFingerprintFromValues(objectSize, etag, lastModified, contentType)
	return thumbnailCachePath(baseDir, profileID, bucket, key, size, fingerprint), true
}

func serveCachedThumbnail(w http.ResponseWriter, r *http.Request, cachePath string) bool {
	info, err := os.Stat(cachePath)
	if err != nil || info.IsDir() {
		return false
	}
	if time.Since(info.ModTime()) > thumbnailCacheTTL {
		return false
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", fmt.Sprintf("private, max-age=%d", int(thumbnailCacheTTL.Seconds())))
	http.ServeFile(w, r, cachePath)
	return true
}

func writeThumbnailFile(cachePath string, img image.Image) error {
	if img == nil {
		return errors.New("empty image")
	}
	dir := filepath.Dir(cachePath)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, "thumb-*.jpg")
	if err != nil {
		return err
	}
	defer func() {
		_ = os.Remove(tmp.Name())
	}()

	if err := jpeg.Encode(tmp, img, &jpeg.Options{Quality: 82}); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), cachePath)
}

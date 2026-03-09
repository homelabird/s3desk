package api

import (
	"bytes"
	"context"
	"crypto/sha256"
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
)

const (
	thumbnailDefaultSize   = 96
	thumbnailMinSize       = 24
	thumbnailMaxSize       = 512
	thumbnailImageMaxBytes = 25 * 1024 * 1024
	thumbnailVideoMaxBytes = 256 * 1024 * 1024
	thumbnailCacheTTL      = 24 * time.Hour
)

var errFFmpegNotFound = errors.New("ffmpeg not found in PATH (or set FFMPEG_PATH)")

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
		writeError(w, http.StatusUnsupportedMediaType, "unsupported", "thumbnail not supported for this object", map[string]any{"key": key})
		return
	}
	maxBytes := thumbnailMaxBytesForKind(kind)
	if entry.Size > maxBytes {
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

	downloadCtx := r.Context()
	cancelDownload := func() {}
	if kind == "video" {
		var cancel context.CancelFunc
		downloadCtx, cancel = context.WithCancel(r.Context())
		cancelDownload = cancel
		defer cancelDownload()
	}

	proc, err := s.startRclone(downloadCtx, secrets, []string{"cat", rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)}, "thumbnail")
	if err != nil {
		metric.SetStatus("remote_error")
		writeRcloneAPIError(w, err, "", rcloneAPIErrorContext{
			MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to download object",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	var img image.Image
	videoStreamStopped := false
	switch kind {
	case "image":
		img, err = decodeThumbnailImage(proc.stdout)
	case "video":
		img, err = decodeThumbnailVideoFrame(r.Context(), ffmpegPath, proc.stdout)
		if err == nil {
			cancelDownload()
			videoStreamStopped = true
		}
	default:
		err = errors.New("unsupported thumbnail kind")
	}
	waitErr := proc.wait()
	if videoStreamStopped {
		waitErr = nil
	}
	if err != nil {
		metric.SetStatus("unsupported")
		writeError(w, http.StatusUnsupportedMediaType, "unsupported", "failed to decode thumbnail source", map[string]any{"error": err.Error()})
		return
	}
	if waitErr != nil {
		metric.SetStatus("remote_error")
		writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
			MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to download object",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	thumb := resizeForThumbnail(img, size)
	if err := writeThumbnailFile(cachePath, thumb); err != nil {
		metric.SetStatus("internal_error")
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to store thumbnail", map[string]any{"error": err.Error()})
		return
	}

	metric.SetStatus("success")
	_ = serveCachedThumbnail(w, r, cachePath)
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

func thumbnailMaxBytesForKind(kind string) int64 {
	if kind == "video" {
		return thumbnailVideoMaxBytes
	}
	return thumbnailImageMaxBytes
}

func decodeThumbnailVideoFrame(ctx context.Context, ffmpegPath string, r io.Reader) (image.Image, error) {
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

func resolveFFmpegPath() (string, error) {
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
	parts := []string{fmt.Sprintf("v2:size=%d", entry.Size)}
	if etag := rcloneETagFromHashes(entry.Hashes); etag != "" {
		parts = append(parts, "etag="+etag)
	}
	if lm := rcloneParseTime(entry.ModTime); lm != "" {
		parts = append(parts, "lastModified="+lm)
	}
	if mimeType := strings.ToLower(strings.TrimSpace(entry.MimeType)); mimeType != "" {
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

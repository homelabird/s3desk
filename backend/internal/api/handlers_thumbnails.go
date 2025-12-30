package api

import (
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
	thumbnailDefaultSize = 96
	thumbnailMinSize     = 24
	thumbnailMaxSize     = 512
	thumbnailMaxBytes    = 25 * 1024 * 1024
	thumbnailCacheTTL    = 24 * time.Hour
)

func (s *server) handleGetObjectThumbnail(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	key := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("key")), "/")
	if bucket == "" || key == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
		return
	}

	size := parseThumbnailSize(r.URL.Query().Get("size"))
	cachePath := thumbnailCachePath(s.cfg.DataDir, secrets.ID, bucket, key, size)
	if serveCachedThumbnail(w, r, cachePath) {
		return
	}

	entry, stderr, err := s.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), false, false, "thumbnail-meta")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to get object metadata",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	if !isThumbnailCandidate(entry.MimeType, key) {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported", "thumbnail not supported for this object", map[string]any{"key": key})
		return
	}
	if entry.Size > thumbnailMaxBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "object is too large for thumbnail", map[string]any{
			"maxBytes": thumbnailMaxBytes,
			"size":     entry.Size,
		})
		return
	}

	proc, err := s.startRclone(r.Context(), secrets, []string{"cat", rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)}, "thumbnail")
	if err != nil {
		writeRcloneAPIError(w, err, "", rcloneAPIErrorContext{
			MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to download object",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	img, err := decodeThumbnailImage(proc.stdout)
	waitErr := proc.wait()
	if err != nil {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported", "failed to decode image", map[string]any{"error": err.Error()})
		return
	}
	if waitErr != nil {
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
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to store thumbnail", map[string]any{"error": err.Error()})
		return
	}

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

func isThumbnailCandidate(contentType, key string) bool {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if strings.HasPrefix(ct, "image/") && ct != "image/svg+xml" {
		return true
	}
	ext := strings.TrimPrefix(strings.ToLower(path.Ext(key)), ".")
	switch ext {
	case "jpg", "jpeg", "png", "gif", "webp", "bmp":
		return true
	default:
		return false
	}
}

func decodeThumbnailImage(r io.Reader) (image.Image, error) {
	limited := io.LimitReader(r, thumbnailMaxBytes+1)
	img, _, err := image.Decode(limited)
	if err != nil {
		return nil, err
	}
	return img, nil
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

func thumbnailCachePath(baseDir, profileID, bucket, key string, size int) string {
	sum := sha256.Sum256([]byte(profileID + "\n" + bucket + "\n" + key))
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
	if err := os.MkdirAll(dir, 0o755); err != nil {
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

package api

import (
	"errors"
	"image"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type objectThumbnailHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectThumbnailHTTPService struct {
	server *server
}

func (e *objectThumbnailHTTPError) Error() string {
	return e.message
}

func newObjectThumbnailHTTPService(s *server) objectThumbnailHTTPService {
	return objectThumbnailHTTPService{server: s}
}

func newObjectThumbnailHTTPError(status int, code, message string, details map[string]any) *objectThumbnailHTTPError {
	return &objectThumbnailHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectThumbnailMetaRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to get object metadata",
	}
}

func buildObjectThumbnailFetchRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to fetch thumbnails (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to download object",
	}
}

func (svc objectThumbnailHTTPService) prepareGetObjectThumbnail(metric *storageMetric, r *http.Request) (models.ProfileSecrets, string, string, int, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		return models.ProfileSecrets{}, "", "", 0, newObjectThumbnailHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	key := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("key")), "/")
	if bucket == "" || key == "" {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", 0, newObjectThumbnailHTTPError(http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
	}

	size, err := parseThumbnailSize(r.URL.Query().Get("size"))
	if err != nil {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", 0, newObjectThumbnailHTTPError(http.StatusBadRequest, "invalid_request", "size is invalid", map[string]any{"size": r.URL.Query().Get("size")})
	}

	return secrets, bucket, key, size, nil
}

func (svc objectThumbnailHTTPService) executePrepared(metric *storageMetric, w http.ResponseWriter, r *http.Request, secrets models.ProfileSecrets, bucket string, key string, size int) (bool, error, string, rcloneAPIErrorContext, map[string]any, error) {
	if cacheHitSource, ok := tryServeThumbnailBeforeStat(svc.server, w, r, secrets.ID, bucket, key, size); ok {
		if svc.server.metrics != nil {
			svc.server.metrics.IncThumbnailCacheHit(cacheHitSource)
		}
		metric.SetStatus("cache_hit")
		return true, nil, "", rcloneAPIErrorContext{}, nil, nil
	}

	details := map[string]any{"bucket": bucket, "key": key}
	entry, stderr, err := svc.server.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, false, "thumbnail-meta")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			return false, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(http.StatusNotFound, "not_found", "object not found", details)
		}
		metric.SetStatus("remote_error")
		return false, err, stderr, buildObjectThumbnailMetaRcloneErrorContext(), details, nil
	}

	kind := thumbnailObjectKind(entry.MimeType, key)
	if kind == "" {
		metric.SetStatus("unsupported")
		return false, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(http.StatusUnsupportedMediaType, "unsupported", "thumbnail not supported for this object", map[string]any{
			"key":      key,
			"mimeType": entry.MimeType,
			"size":     entry.Size,
		})
	}

	maxBytes := thumbnailMaxBytesForKind(kind)
	if maxBytes > 0 && entry.Size > maxBytes {
		metric.SetStatus("too_large")
		return false, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(http.StatusRequestEntityTooLarge, "too_large", "object is too large for thumbnail", map[string]any{
			"kind":     kind,
			"maxBytes": maxBytes,
			"size":     entry.Size,
		})
	}

	cachePath := thumbnailCachePath(svc.server.cfg.DataDir, secrets.ID, bucket, key, size, thumbnailObjectFingerprint(entry))
	if serveCachedThumbnail(w, r, cachePath) {
		_ = writeThumbnailManifest(svc.server.cfg.DataDir, secrets.ID, bucket, key, size, thumbnailManifestEntry{
			Fingerprint: thumbnailObjectFingerprint(entry),
			CachePath:   cachePath,
		})
		if svc.server.metrics != nil {
			svc.server.metrics.IncThumbnailCacheHit("post_stat")
		}
		metric.SetStatus("cache_hit")
		return true, nil, "", rcloneAPIErrorContext{}, nil, nil
	}

	ffmpegPath := ""
	if kind == "video" {
		ffmpegPath, err = resolveFFmpegPath()
		if err != nil {
			metric.SetStatus("thumbnail_engine_missing")
			return false, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(
				http.StatusBadRequest,
				"thumbnail_engine_missing",
				"ffmpeg is required to fetch video thumbnails (install it or set FFMPEG_PATH)",
				map[string]any{"key": key},
			)
		}
	}

	img, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.loadSourceImage(metric, r, secrets, bucket, key, entry, kind, ffmpegPath)
	if rcloneErr != nil || err != nil {
		return false, rcloneErr, stderr, rcloneCtx, rcloneDetails, err
	}

	thumb := resizeForThumbnail(img, size)
	if err := writeThumbnailFile(cachePath, thumb); err != nil {
		metric.SetStatus("internal_error")
		return false, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(http.StatusInternalServerError, "internal_error", "failed to store thumbnail", map[string]any{"error": err.Error()})
	}
	_ = writeThumbnailManifest(svc.server.cfg.DataDir, secrets.ID, bucket, key, size, thumbnailManifestEntry{
		Fingerprint: thumbnailObjectFingerprint(entry),
		CachePath:   cachePath,
	})

	metric.SetStatus("success")
	_ = serveCachedThumbnail(w, r, cachePath)
	return true, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectThumbnailHTTPService) loadSourceImage(metric *storageMetric, r *http.Request, secrets models.ProfileSecrets, bucket string, key string, entry rcloneListEntry, kind string, ffmpegPath string) (image.Image, error, string, rcloneAPIErrorContext, map[string]any, error) {
	switch kind {
	case "image":
		img, err := svc.server.loadThumbnailSourceImage(r.Context(), secrets, bucket, key)
		if err == nil {
			return img, nil, "", rcloneAPIErrorContext{}, nil, nil
		}
		var fetchErr *thumbnailImageFetchError
		if errors.As(err, &fetchErr) {
			metric.SetStatus("remote_error")
			return nil, fetchErr.err, fetchErr.stderr, buildObjectThumbnailFetchRcloneErrorContext(), map[string]any{"bucket": bucket, "key": key}, nil
		}
		metric.SetStatus("unsupported")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(http.StatusUnsupportedMediaType, "unsupported", "failed to decode thumbnail source", map[string]any{
			"key":      key,
			"kind":     kind,
			"decoder":  "image.Decode",
			"mimeType": entry.MimeType,
			"size":     entry.Size,
			"error":    err.Error(),
		})
	case "video":
		img, attempts, err := svc.server.decodeThumbnailVideoWithFallbacks(r.Context(), secrets, bucket, key, entry.Size, ffmpegPath)
		if err == nil {
			return img, nil, "", rcloneAPIErrorContext{}, nil, nil
		}
		var fetchErr *thumbnailVideoFetchError
		if errors.As(err, &fetchErr) {
			metric.SetStatus("remote_error")
			return nil, fetchErr.err, fetchErr.stderr, buildObjectThumbnailFetchRcloneErrorContext(), map[string]any{"bucket": bucket, "key": key}, nil
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
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(http.StatusUnsupportedMediaType, "unsupported", "failed to extract video thumbnail frame", details)
	default:
		metric.SetStatus("unsupported")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectThumbnailHTTPError(http.StatusUnsupportedMediaType, "unsupported", "unsupported thumbnail kind", map[string]any{"key": key})
	}
}

func (svc objectThumbnailHTTPService) executeGet(w http.ResponseWriter, r *http.Request, metric *storageMetric) (bool, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, key, size, err := svc.prepareGetObjectThumbnail(metric, r)
	if err != nil {
		return false, nil, "", rcloneAPIErrorContext{}, nil, err
	}
	return svc.executePrepared(metric, w, r, secrets, bucket, key, size)
}

func (svc objectThumbnailHTTPService) handleGetObjectThumbnail(w http.ResponseWriter, r *http.Request) {
	metric := svc.server.beginStorageMetric("unknown", "get_object_thumbnail")
	defer metric.Observe()
	wrote, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeGet(w, r, metric)
	switch {
	case wrote:
		return
	case rcloneErr != nil:
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	case err == nil:
		resp := buildAPIErrorResponse("internal_error", "failed to get object thumbnail", nil)
		writeJSON(w, http.StatusInternalServerError, resp)
		return
	default:
		if httpErr, ok := err.(*objectThumbnailHTTPError); ok {
			resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
			writeJSON(w, httpErr.status, resp)
			return
		}
		resp := buildAPIErrorResponse("internal_error", "failed to get object thumbnail", nil)
		writeJSON(w, http.StatusInternalServerError, resp)
	}
}

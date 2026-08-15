package api

import (
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

type objectFavoritesHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectFavoritesHTTPService struct {
	server *server
}

func (e *objectFavoritesHTTPError) Error() string {
	return e.message
}

func newObjectFavoritesHTTPService(s *server) objectFavoritesHTTPService {
	return objectFavoritesHTTPService{server: s}
}

func newObjectFavoritesHTTPError(status int, code, message string, details map[string]any) *objectFavoritesHTTPError {
	return &objectFavoritesHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectFavoritesRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to list favorites (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to get object metadata",
	}
}

func (svc objectFavoritesHTTPService) prepareListObjectFavorites(metric *storageMetric, r *http.Request) (models.ProfileSecrets, string, string, store.ObjectFavoritesFilter, bool, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		return models.ProfileSecrets{}, "", "", store.ObjectFavoritesFilter{}, false, newObjectFavoritesHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}
	metric.SetProvider(string(secrets.Provider))

	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		metric.SetStatus("missing_profile")
		return models.ProfileSecrets{}, "", "", store.ObjectFavoritesFilter{}, false, newObjectFavoritesHTTPError(http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", store.ObjectFavoritesFilter{}, false, newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	hydrate := true
	if raw := strings.TrimSpace(r.URL.Query().Get("hydrate")); raw != "" {
		parsed, parseErr := strconv.ParseBool(raw)
		if parseErr != nil {
			metric.SetStatus("invalid_request")
			return models.ProfileSecrets{}, "", "", store.ObjectFavoritesFilter{}, false, newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "hydrate must be a boolean", map[string]any{"hydrate": raw})
		}
		hydrate = parsed
	}

	limit := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil || parsed < 1 || parsed > 200 {
			metric.SetStatus("invalid_request")
			return models.ProfileSecrets{}, "", "", store.ObjectFavoritesFilter{}, false, newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "limit must be between 1 and 200", map[string]any{"limit": raw})
		}
		limit = parsed
	}
	return secrets, profileID, bucket, store.ObjectFavoritesFilter{
		Prefix: strings.TrimSpace(r.URL.Query().Get("prefix")),
		Limit:  limit,
		Cursor: strings.TrimSpace(r.URL.Query().Get("cursor")),
	}, hydrate, nil
}

func buildObjectFavoritesListResponse(bucket, prefix string, keys []string, nextCursor *string) models.ObjectFavoritesResponse {
	return models.ObjectFavoritesResponse{
		Bucket:     bucket,
		Prefix:     prefix,
		Count:      len(keys),
		Keys:       append([]string(nil), keys...),
		Hydrated:   false,
		Items:      []models.FavoriteObjectItem{},
		NextCursor: nextCursor,
	}
}

func (svc objectFavoritesHTTPService) executeList(metric *storageMetric, r *http.Request) (*models.ObjectFavoritesResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, profileID, bucket, filter, hydrate, err := svc.prepareListObjectFavorites(metric, r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}
	if svc.server.store == nil {
		metric.SetStatus("internal_error")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectFavoritesHTTPError(http.StatusInternalServerError, "internal_error", "failed to list favorites", map[string]any{"error": "store is not configured"})
	}

	favorites, nextCursor, err := svc.server.store.ListObjectFavorites(r.Context(), profileID, bucket, filter)
	if err != nil {
		if errors.Is(err, store.ErrInvalidObjectFavoriteCursor) {
			metric.SetStatus("invalid_request")
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "cursor is invalid", nil)
		}
		metric.SetStatus("internal_error")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectFavoritesHTTPError(http.StatusInternalServerError, "internal_error", "failed to list favorites", map[string]any{"error": err.Error()})
	}

	keys := make([]string, 0, len(favorites))
	for _, fav := range favorites {
		keys = append(keys, fav.Key)
	}
	response := buildObjectFavoritesListResponse(bucket, filter.Prefix, keys, nextCursor)
	if len(keys) == 0 || !hydrate {
		metric.SetStatus("db_only")
		return &response, nil, "", rcloneAPIErrorContext{}, nil, nil
	}

	for _, key := range keys {
		if err := rcloneconfig.ValidateSingleLineValue("favorite key", key); err != nil {
			metric.SetStatus("invalid_request")
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
	}

	tmpPath, err := writeLinesToTempFile("rclone-favorites-*.txt", keys)
	if err != nil {
		metric.SetStatus("internal_error")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectFavoritesHTTPError(http.StatusInternalServerError, "internal_error", "failed to prepare favorites list", map[string]any{"error": err.Error()})
	}
	defer func() { _ = os.Remove(tmpPath) }()

	args := []string{"lsjson", "--files-only", "--no-mimetype", "--hash", "--files-from-raw", tmpPath, rcloneRemoteBucket(bucket)}
	proc, err := svc.server.startRclone(r.Context(), secrets, args, "favorites")
	if err != nil {
		metric.SetStatus("remote_error")
		return nil, err, "", buildObjectFavoritesRcloneErrorContext(), map[string]any{"bucket": bucket}, nil
	}

	entries := make(map[string]rcloneListEntry, len(keys))
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
		metric.SetStatus("internal_error")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectFavoritesHTTPError(http.StatusBadRequest, "s3_error", "failed to get object metadata", map[string]any{"error": listErr.Error()})
	}
	if waitErr != nil {
		metric.SetStatus("remote_error")
		return nil, waitErr, proc.stderr.String(), buildObjectFavoritesRcloneErrorContext(), map[string]any{"bucket": bucket}, nil
	}

	items := make([]models.FavoriteObjectItem, 0, len(keys))
	for _, fav := range favorites {
		entry, ok := entries[fav.Key]
		if !ok {
			continue
		}
		item := models.ObjectItem{Key: fav.Key, Size: entry.Size}
		if etag := rcloneETagFromHashes(entry.Hashes); etag != "" {
			item.ETag = etag
		}
		if lm := rcloneParseTime(entry.ModTime); lm != "" {
			item.LastModified = lm
		}
		items = append(items, models.FavoriteObjectItem{ObjectItem: item, CreatedAt: fav.CreatedAt})
	}

	response.Hydrated = true
	response.Items = items
	metric.SetStatus("success")
	return &response, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectFavoritesHTTPService) prepareCreateObjectFavorite(r *http.Request) (string, string, string, error) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	var req models.ObjectFavoriteCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	if err := rcloneconfig.ValidateSingleLineValue("key", req.Key); err != nil {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
	}

	key := strings.TrimPrefix(strings.TrimSpace(req.Key), "/")
	if key == "" {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "key is required", nil)
	}

	return profileID, bucket, key, nil
}

func (svc objectFavoritesHTTPService) executeCreate(r *http.Request) (*models.ObjectFavorite, error) {
	profileID, bucket, key, err := svc.prepareCreateObjectFavorite(r)
	if err != nil {
		return nil, err
	}
	if svc.server.store == nil {
		return nil, newObjectFavoritesHTTPError(http.StatusInternalServerError, "internal_error", "failed to create favorite", map[string]any{"error": "store is not configured"})
	}

	fav, err := svc.server.store.AddObjectFavorite(r.Context(), profileID, bucket, key)
	if err != nil {
		return nil, newObjectFavoritesHTTPError(http.StatusInternalServerError, "internal_error", "failed to create favorite", map[string]any{"error": err.Error()})
	}
	return &fav, nil
}

func (svc objectFavoritesHTTPService) prepareDeleteObjectFavorite(r *http.Request) (string, string, string, error) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	key := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("key")), "/")
	if key == "" {
		return "", "", "", newObjectFavoritesHTTPError(http.StatusBadRequest, "invalid_request", "key is required", nil)
	}

	return profileID, bucket, key, nil
}

func (svc objectFavoritesHTTPService) executeDelete(r *http.Request) error {
	profileID, bucket, key, err := svc.prepareDeleteObjectFavorite(r)
	if err != nil {
		return err
	}
	if svc.server.store == nil {
		return newObjectFavoritesHTTPError(http.StatusInternalServerError, "internal_error", "failed to delete favorite", map[string]any{"error": "store is not configured"})
	}

	_, err = svc.server.store.DeleteObjectFavorite(r.Context(), profileID, bucket, key)
	if err != nil {
		return newObjectFavoritesHTTPError(http.StatusInternalServerError, "internal_error", "failed to delete favorite", map[string]any{"error": err.Error()})
	}
	return nil
}

func (svc objectFavoritesHTTPService) handleListObjectFavorites(w http.ResponseWriter, r *http.Request) {
	metric := svc.server.beginStorageMetric("unknown", "list_object_favorites")
	defer metric.Observe()
	resp, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeList(metric, r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if httpErr, ok := err.(*objectFavoritesHTTPError); ok {
		respErr := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildAPIErrorResponse("internal_error", "failed to list favorites", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

func (svc objectFavoritesHTTPService) handleCreateObjectFavorite(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeCreate(r)
	if err == nil {
		writeJSON(w, http.StatusCreated, resp)
		return
	}
	if httpErr, ok := err.(*objectFavoritesHTTPError); ok {
		respErr := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildAPIErrorResponse("internal_error", "failed to create favorite", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

func (svc objectFavoritesHTTPService) handleDeleteObjectFavorite(w http.ResponseWriter, r *http.Request) {
	err := svc.executeDelete(r)
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if httpErr, ok := err.(*objectFavoritesHTTPError); ok {
		respErr := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to delete favorite", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

package api

import (
	"bufio"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

func (s *server) handleListObjectFavorites(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}
	prefix := strings.TrimSpace(r.URL.Query().Get("prefix"))

	favorites, err := s.store.ListObjectFavorites(r.Context(), profileID, bucket)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list favorites", map[string]any{"error": err.Error()})
		return
	}

	keys := make([]string, 0, len(favorites))
	for _, fav := range favorites {
		if prefix != "" && !strings.HasPrefix(fav.Key, prefix) {
			continue
		}
		keys = append(keys, fav.Key)
	}
	if len(keys) == 0 {
		writeJSON(w, http.StatusOK, models.ObjectFavoritesResponse{
			Bucket: bucket,
			Prefix: prefix,
			Items:  []models.FavoriteObjectItem{},
		})
		return
	}

	tmpFile, err := os.CreateTemp("", "rclone-favorites-*.txt")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare favorites list", map[string]any{"error": err.Error()})
		return
	}
	tmpPath := tmpFile.Name()
	defer func() { _ = os.Remove(tmpPath) }()

	writer := bufio.NewWriter(tmpFile)
	for _, key := range keys {
		if _, err := writer.WriteString(key + "\n"); err != nil {
			_ = tmpFile.Close()
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare favorites list", map[string]any{"error": err.Error()})
			return
		}
	}
	if err := writer.Flush(); err != nil {
		_ = tmpFile.Close()
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare favorites list", map[string]any{"error": err.Error()})
		return
	}
	if err := tmpFile.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare favorites list", map[string]any{"error": err.Error()})
		return
	}

	args := []string{"lsjson", "--files-only", "--no-mimetype", "--hash", "--files-from-raw", tmpPath, rcloneRemoteBucket(bucket)}
	proc, err := s.startRclone(r.Context(), secrets, args, "favorites")
	if err != nil {
		writeRcloneAPIError(w, err, "", rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list favorites (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to get object metadata",
		}, map[string]any{"bucket": bucket})
		return
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
		writeError(w, http.StatusBadRequest, "s3_error", "failed to get object metadata", map[string]any{"error": listErr.Error()})
		return
	}
	if waitErr != nil {
		writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list favorites (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to get object metadata",
		}, map[string]any{"bucket": bucket})
		return
	}

	items := make([]models.FavoriteObjectItem, 0, len(keys))
	for _, fav := range favorites {
		if prefix != "" && !strings.HasPrefix(fav.Key, prefix) {
			continue
		}
		entry, ok := entries[fav.Key]
		if !ok {
			continue
		}
		item := models.ObjectItem{
			Key:  fav.Key,
			Size: entry.Size,
		}
		if etag := rcloneETagFromHashes(entry.Hashes); etag != "" {
			item.ETag = etag
		}
		if lm := rcloneParseTime(entry.ModTime); lm != "" {
			item.LastModified = lm
		}
		items = append(items, models.FavoriteObjectItem{
			ObjectItem: item,
			CreatedAt:  fav.CreatedAt,
		})
	}

	writeJSON(w, http.StatusOK, models.ObjectFavoritesResponse{
		Bucket: bucket,
		Prefix: prefix,
		Items:  items,
	})
}

func (s *server) handleCreateObjectFavorite(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	var req models.ObjectFavoriteCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	key := strings.TrimPrefix(strings.TrimSpace(req.Key), "/")
	if key == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "key is required", nil)
		return
	}
	if strings.ContainsRune(key, 0) {
		writeError(w, http.StatusBadRequest, "invalid_request", "key contains invalid characters", nil)
		return
	}

	fav, err := s.store.AddObjectFavorite(r.Context(), profileID, bucket, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create favorite", map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, fav)
}

func (s *server) handleDeleteObjectFavorite(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	key := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("key")), "/")
	if key == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "key is required", nil)
		return
	}

	_, err := s.store.DeleteObjectFavorite(r.Context(), profileID, bucket, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to delete favorite", map[string]any{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

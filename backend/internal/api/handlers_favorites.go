package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"

	"object-storage/internal/models"
	"object-storage/internal/s3client"
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

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	items := make([]models.FavoriteObjectItem, 0, len(favorites))
	for _, fav := range favorites {
		if prefix != "" && !strings.HasPrefix(fav.Key, prefix) {
			continue
		}
		out, err := client.HeadObject(r.Context(), &s3.HeadObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(fav.Key),
		})
		if err != nil {
			if isNotFound(err) {
				continue
			}
			writeError(w, http.StatusBadRequest, "s3_error", "failed to get object metadata", map[string]any{"error": err.Error()})
			return
		}

		item := models.ObjectItem{
			Key:  fav.Key,
			Size: aws.ToInt64(out.ContentLength),
		}
		if out.ETag != nil {
			item.ETag = aws.ToString(out.ETag)
		}
		if out.LastModified != nil {
			item.LastModified = out.LastModified.UTC().Format(time.RFC3339Nano)
		}
		if out.StorageClass != "" {
			item.StorageClass = string(out.StorageClass)
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

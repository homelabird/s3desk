package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneerrors"
)

func (s *server) handleListBuckets(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	// GCS bucket operations require a project number for list/create/delete buckets.
	// See rclone docs: google cloud storage backend -> project_number.
	if secrets.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(secrets.GcpProjectNumber) == "" {
		writeError(w, http.StatusBadRequest, "invalid_config", "gcp projectNumber is required to list buckets", map[string]any{"field": "projectNumber"})
		return
	}

	proc, err := s.startRclone(r.Context(), secrets, []string{"lsjson", "--dirs-only", "remote:"}, "list-buckets")
	if err != nil {
		writeRcloneAPIError(w, err, "", rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list buckets (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to list buckets",
		}, nil)
		return
	}

	resp := make([]models.Bucket, 0, 16)
	listErr := decodeRcloneList(proc.stdout, func(entry rcloneListEntry) error {
		if !entry.IsDir && !entry.IsBucket {
			return nil
		}
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			name = strings.TrimSpace(entry.Path)
		}
		if name == "" {
			return nil
		}
		resp = append(resp, models.Bucket{Name: name})
		return nil
	})
	waitErr := proc.wait()
	if listErr != nil {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to list buckets", map[string]any{"error": listErr.Error()})
		return
	}
	if waitErr != nil {
		writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list buckets (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to list buckets",
		}, nil)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleCreateBucket(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	// GCS bucket operations require a project number for list/create/delete buckets.
	// See rclone docs: google cloud storage backend -> project_number.
	if secrets.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(secrets.GcpProjectNumber) == "" {
		writeError(w, http.StatusBadRequest, "invalid_config", "gcp projectNumber is required to create buckets", map[string]any{"field": "projectNumber"})
		return
	}

	var req models.BucketCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Region = strings.TrimSpace(req.Region)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket name is required", nil)
		return
	}

	args := []string{"mkdir"}
	if secrets.Provider == models.ProfileProviderGcpGcs {
		// For GCS, bucket creation location is controlled by --gcs-location.
		// (We reuse req.Region field from the API for this value.)
		if req.Region != "" {
			args = append(args, "--gcs-location", req.Region)
		}
	} else if req.Region != "" {
		// For S3/S3-compatible providers, region affects bucket creation.
		secrets.Region = req.Region
	}
	args = append(args, rcloneRemoteBucket(req.Name))

	_, stderr, err := s.runRcloneCapture(r.Context(), secrets, args, "create-bucket")
	if err != nil {
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to create buckets (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to create bucket",
		}, nil)
		return
	}

	resp := models.Bucket{
		Name:      req.Name,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *server) handleDeleteBucket(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	// GCS bucket operations require a project number for list/create/delete buckets.
	// See rclone docs: google cloud storage backend -> project_number.
	if secrets.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(secrets.GcpProjectNumber) == "" {
		writeError(w, http.StatusBadRequest, "invalid_config", "gcp projectNumber is required to delete buckets", map[string]any{"field": "projectNumber"})
		return
	}

	bucket := chi.URLParam(r, "bucket")
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	_, stderr, err := s.runRcloneCapture(r.Context(), secrets, []string{"rmdir", rcloneRemoteBucket(bucket)}, "delete-bucket")
	if err != nil {
		if rcloneerrors.IsBucketNotEmpty(strings.ToLower(rcloneErrorMessage(err, stderr))) {
			writeError(w, http.StatusConflict, "bucket_not_empty", "bucket is not empty; delete objects first", map[string]any{"bucket": bucket})
			return
		}
		if rcloneIsBucketNotFound(err, stderr) || rcloneIsNotFound(err, stderr) {
			writeError(w, http.StatusNotFound, "not_found", "bucket not found", map[string]any{"bucket": bucket})
			return
		}
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to delete buckets (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to delete bucket",
		}, map[string]any{"bucket": bucket})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

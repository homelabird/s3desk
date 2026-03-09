package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/bucketgov"
	"s3desk/internal/models"
	"s3desk/internal/rcloneerrors"
)

func (s *server) handleListBuckets(w http.ResponseWriter, r *http.Request) {
	metric := s.beginStorageMetric("unknown", "list_buckets")
	defer metric.Observe()

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	metric.SetProvider(string(secrets.Provider))

	// GCS bucket operations require a project number for list/create/delete buckets.
	// See rclone docs: google cloud storage backend -> project_number.
	if secrets.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(secrets.GcpProjectNumber) == "" {
		metric.SetStatus("invalid_config")
		writeError(w, http.StatusBadRequest, "invalid_config", "gcp projectNumber is required to list buckets", map[string]any{"field": "projectNumber"})
		return
	}

	proc, err := s.startRclone(r.Context(), secrets, []string{"lsjson", "--dirs-only", "remote:"}, "list-buckets")
	if err != nil {
		metric.SetStatus("remote_error")
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
		if waitErr != nil {
			metric.SetStatus("remote_error")
			writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
				MissingMessage: "rclone is required to list buckets (install it or set RCLONE_PATH)",
				DefaultStatus:  http.StatusBadRequest,
				DefaultCode:    "s3_error",
				DefaultMessage: "failed to list buckets",
			}, nil)
			return
		}
		metric.SetStatus("internal_error")
		writeError(w, http.StatusBadRequest, "s3_error", "failed to list buckets", map[string]any{"error": listErr.Error()})
		return
	}
	if waitErr != nil {
		metric.SetStatus("remote_error")
		writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list buckets (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to list buckets",
		}, nil)
		return
	}
	metric.SetStatus("success")
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleCreateBucket(w http.ResponseWriter, r *http.Request) {
	metric := s.beginStorageMetric("unknown", "create_bucket")
	defer metric.Observe()

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	metric.SetProvider(string(secrets.Provider))

	// GCS bucket operations require a project number for list/create/delete buckets.
	// See rclone docs: google cloud storage backend -> project_number.
	if secrets.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(secrets.GcpProjectNumber) == "" {
		metric.SetStatus("invalid_config")
		writeError(w, http.StatusBadRequest, "invalid_config", "gcp projectNumber is required to create buckets", map[string]any{"field": "projectNumber"})
		return
	}

	var req models.BucketCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		metric.SetStatus("invalid_json")
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Region = strings.TrimSpace(req.Region)
	if req.Name == "" {
		metric.SetStatus("invalid_request")
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket name is required", nil)
		return
	}
	if req.Defaults != nil {
		if s.bucketGov == nil {
			metric.SetStatus("internal_error")
			writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is unavailable", nil)
			return
		}
		if err := bucketgov.ValidateCreateDefaults(secrets.Provider, req.Defaults); err != nil {
			metric.SetStatus("invalid_request")
			writeCreateBucketDefaultsValidationError(w, err)
			return
		}
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
		metric.SetStatus("remote_error")
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to create buckets (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to create bucket",
		}, nil)
		return
	}
	if req.Defaults != nil {
		if err := bucketgov.ApplyCreateDefaults(r.Context(), s.bucketGov, secrets, req.Name, req.Defaults); err != nil {
			metric.SetStatus("defaults_apply_failed")
			writeCreateBucketDefaultsApplyError(w, err, secrets.Provider, req.Name)
			return
		}
	}

	resp := models.Bucket{
		Name:      req.Name,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	metric.SetStatus("success")
	writeJSON(w, http.StatusCreated, resp)
}

func writeCreateBucketDefaultsValidationError(w http.ResponseWriter, err error) {
	var opErr *bucketgov.OperationError
	if errors.As(err, &opErr) && opErr != nil {
		writeError(w, opErr.Status, opErr.Code, opErr.Message, opErr.Details)
		return
	}
	writeError(w, http.StatusBadRequest, "invalid_request", "invalid bucket defaults", map[string]any{"error": err.Error()})
}

func writeCreateBucketDefaultsApplyError(w http.ResponseWriter, err error, provider models.ProfileProvider, bucket string) {
	status := http.StatusBadGateway
	details := map[string]any{
		"provider":      provider,
		"bucket":        strings.TrimSpace(bucket),
		"bucketCreated": true,
	}
	applyCode := ""

	var applyErr *bucketgov.CreateDefaultsApplyError
	if errors.As(err, &applyErr) && applyErr != nil {
		if section := strings.TrimSpace(applyErr.Section); section != "" {
			details["applySection"] = section
		}
		err = applyErr.Err
	}

	var opErr *bucketgov.OperationError
	if errors.As(err, &opErr) && opErr != nil {
		status = opErr.Status
		applyCode = strings.TrimSpace(opErr.Code)
		for key, value := range opErr.Details {
			details[key] = value
		}
		if applyCode != "" {
			details["applyErrorCode"] = applyCode
		}
		if message := strings.TrimSpace(opErr.Message); message != "" {
			details["applyErrorMessage"] = message
		}
	} else {
		var unsupportedProvider bucketgov.UnsupportedProviderError
		if errors.As(err, &unsupportedProvider) {
			status = http.StatusBadRequest
			details["provider"] = unsupportedProvider.Provider
			applyCode = "bucket_governance_unsupported"
		}
		var unsupportedOperation bucketgov.UnsupportedOperationError
		if errors.As(err, &unsupportedOperation) {
			status = http.StatusBadRequest
			details["provider"] = unsupportedOperation.Provider
			if section := strings.TrimSpace(unsupportedOperation.Section); section != "" {
				details["applySection"] = section
			}
			applyCode = "bucket_governance_unsupported"
		}
		details["error"] = err.Error()
		if applyCode != "" {
			details["applyErrorCode"] = applyCode
		}
	}

	resp := models.ErrorResponse{
		Error: models.APIError{
			Code:    "bucket_defaults_apply_failed",
			Message: "bucket was created but failed to apply secure defaults",
			Details: details,
		},
	}
	if applyCode != "" {
		if normalized, ok := normalizedErrorFromCode(applyCode); ok {
			resp.Error.NormalizedError = normalized
		}
	}
	writeJSON(w, status, resp)
}

func (s *server) handleDeleteBucket(w http.ResponseWriter, r *http.Request) {
	metric := s.beginStorageMetric("unknown", "delete_bucket")
	defer metric.Observe()

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	metric.SetProvider(string(secrets.Provider))

	// GCS bucket operations require a project number for list/create/delete buckets.
	// See rclone docs: google cloud storage backend -> project_number.
	if secrets.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(secrets.GcpProjectNumber) == "" {
		metric.SetStatus("invalid_config")
		writeError(w, http.StatusBadRequest, "invalid_config", "gcp projectNumber is required to delete buckets", map[string]any{"field": "projectNumber"})
		return
	}

	bucket := chi.URLParam(r, "bucket")
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		metric.SetStatus("invalid_request")
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	_, stderr, err := s.runRcloneCapture(r.Context(), secrets, []string{"rmdir", rcloneRemoteBucket(bucket)}, "delete-bucket")
	if err != nil {
		if rcloneerrors.IsBucketNotEmpty(strings.ToLower(rcloneErrorMessage(err, stderr))) {
			metric.SetStatus("client_error")
			writeError(w, http.StatusConflict, "bucket_not_empty", "bucket is not empty; delete objects first", map[string]any{"bucket": bucket})
			return
		}
		if rcloneIsBucketNotFound(err, stderr) || rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			writeError(w, http.StatusNotFound, "not_found", "bucket not found", map[string]any{"bucket": bucket})
			return
		}
		metric.SetStatus("remote_error")
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to delete buckets (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to delete bucket",
		}, map[string]any{"bucket": bucket})
		return
	}

	metric.SetStatus("success")
	w.WriteHeader(http.StatusNoContent)
}

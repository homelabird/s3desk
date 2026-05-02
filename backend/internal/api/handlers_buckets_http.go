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

type bucketHTTPOperation string

const (
	bucketHTTPOperationList   bucketHTTPOperation = "list"
	bucketHTTPOperationCreate bucketHTTPOperation = "create"
	bucketHTTPOperationDelete bucketHTTPOperation = "delete"
)

type bucketHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketHTTPService struct {
	server *server
}

func (e *bucketHTTPError) Error() string {
	return e.message
}

func newBucketHTTPService(s *server) bucketHTTPService {
	return bucketHTTPService{server: s}
}

func newBucketHTTPError(status int, code, message string, details map[string]any) *bucketHTTPError {
	return &bucketHTTPError{status: status, code: code, message: message, details: details}
}

func buildBucketHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func bucketOperationMetricName(op bucketHTTPOperation) string {
	switch op {
	case bucketHTTPOperationList:
		return "list_buckets"
	case bucketHTTPOperationCreate:
		return "create_bucket"
	default:
		return "delete_bucket"
	}
}

func bucketOperationGCPProjectNumberMessage(op bucketHTTPOperation) string {
	switch op {
	case bucketHTTPOperationList:
		return "gcp projectNumber is required to list buckets"
	case bucketHTTPOperationCreate:
		return "gcp projectNumber is required to create buckets"
	default:
		return "gcp projectNumber is required to delete buckets"
	}
}

func bucketOperationRcloneErrorContext(op bucketHTTPOperation) rcloneAPIErrorContext {
	switch op {
	case bucketHTTPOperationList:
		return rcloneAPIErrorContext{MissingMessage: "rclone is required to list buckets (install it or set RCLONE_PATH)", DefaultStatus: http.StatusBadRequest, DefaultCode: "s3_error", DefaultMessage: "failed to list buckets"}
	case bucketHTTPOperationCreate:
		return rcloneAPIErrorContext{MissingMessage: "rclone is required to create buckets (install it or set RCLONE_PATH)", DefaultStatus: http.StatusBadRequest, DefaultCode: "s3_error", DefaultMessage: "failed to create bucket"}
	default:
		return rcloneAPIErrorContext{MissingMessage: "rclone is required to delete buckets (install it or set RCLONE_PATH)", DefaultStatus: http.StatusBadRequest, DefaultCode: "s3_error", DefaultMessage: "failed to delete bucket"}
	}
}

func (svc bucketHTTPService) prepareBucketOperation(metric *storageMetric, r *http.Request, op bucketHTTPOperation) (models.ProfileSecrets, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		return models.ProfileSecrets{}, newBucketHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}
	metric.SetProvider(string(secrets.Provider))

	if secrets.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(secrets.GcpProjectNumber) == "" {
		metric.SetStatus("invalid_config")
		return models.ProfileSecrets{}, newBucketHTTPError(http.StatusBadRequest, "invalid_config", bucketOperationGCPProjectNumberMessage(op), map[string]any{"field": "projectNumber"})
	}
	return secrets, nil
}

func (svc bucketHTTPService) prepareCreateBucket(metric *storageMetric, r *http.Request) (models.ProfileSecrets, models.BucketCreateRequest, error) {
	secrets, err := svc.prepareBucketOperation(metric, r, bucketHTTPOperationCreate)
	if err != nil {
		return models.ProfileSecrets{}, models.BucketCreateRequest{}, err
	}

	var req models.BucketCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		metric.SetStatus("invalid_json")
		return models.ProfileSecrets{}, models.BucketCreateRequest{}, newBucketHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Region = strings.TrimSpace(req.Region)
	if req.Name == "" {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, models.BucketCreateRequest{}, newBucketHTTPError(http.StatusBadRequest, "invalid_request", "bucket name is required", nil)
	}
	if req.Defaults != nil {
		if svc.server.bucketGov == nil {
			metric.SetStatus("internal_error")
			return models.ProfileSecrets{}, models.BucketCreateRequest{}, newBucketHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is unavailable", nil)
		}
		if err := bucketgov.ValidateCreateDefaults(secrets.Provider, req.Defaults); err != nil {
			metric.SetStatus("invalid_request")
			return models.ProfileSecrets{}, models.BucketCreateRequest{}, buildCreateBucketDefaultsValidationError(err)
		}
	}

	return secrets, req, nil
}

func (svc bucketHTTPService) prepareDeleteBucket(metric *storageMetric, r *http.Request) (models.ProfileSecrets, string, error) {
	secrets, err := svc.prepareBucketOperation(metric, r, bucketHTTPOperationDelete)
	if err != nil {
		return models.ProfileSecrets{}, "", err
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", newBucketHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}
	return secrets, bucket, nil
}

func (svc bucketHTTPService) executeList(metric *storageMetric, r *http.Request) ([]models.Bucket, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, err := svc.prepareBucketOperation(metric, r, bucketHTTPOperationList)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	proc, err := svc.server.startRclone(r.Context(), secrets, []string{"lsjson", "--dirs-only", "remote:"}, "list-buckets")
	if err != nil {
		metric.SetStatus("remote_error")
		return nil, err, "", bucketOperationRcloneErrorContext(bucketHTTPOperationList), nil, nil
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
			return nil, waitErr, proc.stderr.String(), bucketOperationRcloneErrorContext(bucketHTTPOperationList), nil, nil
		}
		metric.SetStatus("internal_error")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newBucketHTTPError(http.StatusBadRequest, "s3_error", "failed to list buckets", map[string]any{"error": listErr.Error()})
	}
	if waitErr != nil {
		metric.SetStatus("remote_error")
		return nil, waitErr, proc.stderr.String(), bucketOperationRcloneErrorContext(bucketHTTPOperationList), nil, nil
	}

	metric.SetStatus("success")
	return resp, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc bucketHTTPService) executeCreate(metric *storageMetric, r *http.Request) (*models.Bucket, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, createReq, err := svc.prepareCreateBucket(metric, r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	args := []string{"mkdir"}
	if secrets.Provider == models.ProfileProviderGcpGcs {
		if createReq.Region != "" {
			args = append(args, "--gcs-location", createReq.Region)
		}
	} else if createReq.Region != "" {
		secrets.Region = createReq.Region
	}
	args = append(args, rcloneRemoteBucket(createReq.Name))

	_, stderr, err := svc.server.runRcloneCapture(r.Context(), secrets, args, "create-bucket")
	if err != nil {
		metric.SetStatus("remote_error")
		return nil, err, stderr, bucketOperationRcloneErrorContext(bucketHTTPOperationCreate), nil, nil
	}
	if createReq.Defaults != nil {
		if err := bucketgov.ApplyCreateDefaults(r.Context(), svc.server.bucketGov, secrets, createReq.Name, createReq.Defaults); err != nil {
			metric.SetStatus("defaults_apply_failed")
			return nil, nil, "", rcloneAPIErrorContext{}, nil, buildCreateBucketDefaultsApplyError(err, secrets.Provider, createReq.Name)
		}
	}

	resp := &models.Bucket{Name: createReq.Name, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	metric.SetStatus("success")
	return resp, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc bucketHTTPService) executeDelete(metric *storageMetric, r *http.Request) (error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, err := svc.prepareDeleteBucket(metric, r)
	if err != nil {
		return nil, "", rcloneAPIErrorContext{}, nil, err
	}

	_, stderr, err := svc.server.runRcloneCapture(r.Context(), secrets, []string{"rmdir", rcloneRemoteBucket(bucket)}, "delete-bucket")
	if err != nil {
		if rcloneerrors.IsBucketNotEmpty(strings.ToLower(rcloneErrorMessage(err, stderr))) {
			metric.SetStatus("client_error")
			return nil, "", rcloneAPIErrorContext{}, nil, newBucketHTTPError(http.StatusConflict, "bucket_not_empty", "bucket is not empty; delete objects first", map[string]any{"bucket": bucket})
		}
		if rcloneIsBucketNotFound(err, stderr) || rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			return nil, "", rcloneAPIErrorContext{}, nil, newBucketHTTPError(http.StatusNotFound, "not_found", "bucket not found", map[string]any{"bucket": bucket})
		}
		metric.SetStatus("remote_error")
		return err, stderr, bucketOperationRcloneErrorContext(bucketHTTPOperationDelete), map[string]any{"bucket": bucket}, nil
	}

	metric.SetStatus("success")
	return nil, "", rcloneAPIErrorContext{}, nil, nil
}

func buildCreateBucketDefaultsValidationError(err error) *bucketHTTPError {
	var opErr *bucketgov.OperationError
	if errors.As(err, &opErr) && opErr != nil {
		return newBucketHTTPError(opErr.Status, opErr.Code, opErr.Message, opErr.Details)
	}
	return newBucketHTTPError(http.StatusBadRequest, "invalid_request", "invalid bucket defaults", map[string]any{"error": err.Error()})
}

func buildCreateBucketDefaultsApplyError(err error, provider models.ProfileProvider, bucket string) *bucketHTTPError {
	status := http.StatusBadGateway
	details := map[string]any{"provider": provider, "bucket": strings.TrimSpace(bucket), "bucketCreated": true}
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

	return newBucketHTTPError(status, "bucket_defaults_apply_failed", "bucket was created but failed to apply secure defaults", details)
}

func (svc bucketHTTPService) handleListBuckets(w http.ResponseWriter, r *http.Request) {
	metric := svc.server.beginStorageMetric("unknown", bucketOperationMetricName(bucketHTTPOperationList))
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

	var httpErr *bucketHTTPError
	if errors.As(err, &httpErr) {
		resp := buildBucketHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		if httpErr.code == "bucket_defaults_apply_failed" {
			if applyCode, ok := httpErr.details["applyErrorCode"].(string); ok && applyCode != "" {
				if normalized, ok := normalizedErrorFromCode(applyCode); ok {
					resp.Error.NormalizedError = normalized
				}
			}
		}
		writeJSON(w, httpErr.status, resp)
		return
	}

	respErr := buildBucketHTTPErrorResponse("internal_error", "failed to handle bucket request", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

func (svc bucketHTTPService) handleCreateBucket(w http.ResponseWriter, r *http.Request) {
	metric := svc.server.beginStorageMetric("unknown", bucketOperationMetricName(bucketHTTPOperationCreate))
	defer metric.Observe()
	resp, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeCreate(metric, r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusCreated, resp)
		return
	}

	var httpErr *bucketHTTPError
	if errors.As(err, &httpErr) {
		respErr := buildBucketHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		if httpErr.code == "bucket_defaults_apply_failed" {
			if applyCode, ok := httpErr.details["applyErrorCode"].(string); ok && applyCode != "" {
				if normalized, ok := normalizedErrorFromCode(applyCode); ok {
					respErr.Error.NormalizedError = normalized
				}
			}
		}
		writeJSON(w, httpErr.status, respErr)
		return
	}

	respErr := buildBucketHTTPErrorResponse("internal_error", "failed to handle bucket request", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

func (svc bucketHTTPService) handleDeleteBucket(w http.ResponseWriter, r *http.Request) {
	metric := svc.server.beginStorageMetric("unknown", bucketOperationMetricName(bucketHTTPOperationDelete))
	defer metric.Observe()
	rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeDelete(metric, r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var httpErr *bucketHTTPError
	if errors.As(err, &httpErr) {
		resp := buildBucketHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		if httpErr.code == "bucket_defaults_apply_failed" {
			if applyCode, ok := httpErr.details["applyErrorCode"].(string); ok && applyCode != "" {
				if normalized, ok := normalizedErrorFromCode(applyCode); ok {
					resp.Error.NormalizedError = normalized
				}
			}
		}
		writeJSON(w, httpErr.status, resp)
		return
	}

	resp := buildBucketHTTPErrorResponse("internal_error", "failed to handle bucket request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

package api

import (
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
)

type objectDeleteHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectDeleteHTTPService struct {
	server *server
}

func (e *objectDeleteHTTPError) Error() string {
	return e.message
}

func newObjectDeleteHTTPService(s *server) objectDeleteHTTPService {
	return objectDeleteHTTPService{server: s}
}

func newObjectDeleteHTTPError(status int, code, message string, details map[string]any) *objectDeleteHTTPError {
	return &objectDeleteHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectDeleteHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func buildObjectDeleteRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to delete objects (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to delete objects",
	}
}

func (svc objectDeleteHTTPService) prepareDeleteObjects(r *http.Request) (models.ProfileSecrets, string, []string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", nil, newObjectDeleteHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := chi.URLParam(r, "bucket")
	if bucket == "" {
		return models.ProfileSecrets{}, "", nil, newObjectDeleteHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	var req models.DeleteObjectsRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", nil, newObjectDeleteHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	if len(req.Keys) < 1 {
		return models.ProfileSecrets{}, "", nil, newObjectDeleteHTTPError(http.StatusBadRequest, "invalid_request", "keys must not be empty", nil)
	}
	if len(req.Keys) > 1000 {
		return models.ProfileSecrets{}, "", nil, newObjectDeleteHTTPError(http.StatusBadRequest, "invalid_request", "too many keys (max 1000)", map[string]any{"count": len(req.Keys)})
	}

	keys := make([]string, 0, len(req.Keys))
	for i, k := range req.Keys {
		if k == "" {
			continue
		}
		if err := rcloneconfig.ValidateSingleLineValue("keys["+strconv.Itoa(i)+"]", k); err != nil {
			return models.ProfileSecrets{}, "", nil, newObjectDeleteHTTPError(http.StatusBadRequest, "invalid_request", err.Error(), nil)
		}
		keys = append(keys, k)
	}
	if len(keys) == 0 {
		return models.ProfileSecrets{}, "", nil, newObjectDeleteHTTPError(http.StatusBadRequest, "invalid_request", "keys must contain at least one non-empty key", nil)
	}

	return secrets, bucket, keys, nil
}

func (svc objectDeleteHTTPService) deleteS3LikeMarkerObjects(r *http.Request, secrets models.ProfileSecrets, bucket string, keys []string) error {
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return nil
	}

	client, err := s3ClientFromProfile(secrets, svc.server.cfg.AllowRemote)
	if err != nil {
		return newObjectDeleteHTTPError(http.StatusInternalServerError, "internal_error", "failed to prepare S3 client", nil)
	}
	for _, key := range keys {
		if !strings.HasSuffix(key, "/") {
			continue
		}
		if _, err := client.DeleteObject(r.Context(), &s3.DeleteObjectInput{Bucket: &bucket, Key: &key}); err != nil {
			return newObjectDeleteHTTPError(http.StatusBadRequest, "s3_error", "failed to delete object", map[string]any{
				"bucket": bucket,
				"key":    key,
				"error":  err.Error(),
			})
		}
	}
	return nil
}

func (svc objectDeleteHTTPService) executeDelete(r *http.Request) (*models.DeleteObjectsResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, keys, err := svc.prepareDeleteObjects(r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	tmpPath, err := writeLinesToTempFile("rclone-delete-*.txt", keys)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectDeleteHTTPError(http.StatusInternalServerError, "internal_error", "failed to prepare delete list", map[string]any{"error": err.Error()})
	}
	defer func() { _ = os.Remove(tmpPath) }()

	args := []string{"delete", "--files-from-raw", tmpPath, rcloneRemoteBucket(bucket)}
	_, stderr, err := svc.server.runRcloneCapture(r.Context(), secrets, args, "delete-objects")
	if err != nil {
		return nil, err, stderr, buildObjectDeleteRcloneErrorContext(), map[string]any{"bucket": bucket}, nil
	}

	if err := svc.deleteS3LikeMarkerObjects(r, secrets, bucket, keys); err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	resp := models.DeleteObjectsResponse{Deleted: len(keys)}
	return &resp, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectDeleteHTTPService) handleDeleteObjects(w http.ResponseWriter, r *http.Request) {
	resp, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeDelete(r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if httpErr, ok := err.(*objectDeleteHTTPError); ok {
		respErr := buildObjectDeleteHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildObjectDeleteHTTPErrorResponse("internal_error", "failed to delete objects", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

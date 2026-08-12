package api

import (
	"bytes"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/s3client"
)

type objectCreateFolderHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectCreateFolderHTTPService struct {
	server *server
}

func (e *objectCreateFolderHTTPError) Error() string {
	return e.message
}

func newObjectCreateFolderHTTPService(s *server) objectCreateFolderHTTPService {
	return objectCreateFolderHTTPService{server: s}
}

func newObjectCreateFolderHTTPError(status int, code, message string, details map[string]any) *objectCreateFolderHTTPError {
	return &objectCreateFolderHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectCreateFolderRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to create folders (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to create folder",
	}
}

func validateCreateFolderKey(key string) *objectCreateFolderHTTPError {
	if key == "" {
		return newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_request", "key is required", nil)
	}
	if strings.ContainsRune(key, 0) {
		return newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_request", "key contains invalid characters", nil)
	}
	if strings.Contains(key, "*") {
		return newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_request", "wildcards are not allowed in key", nil)
	}
	if !strings.HasSuffix(key, "/") {
		return newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_request", "key must end with '/'", map[string]any{"key": key})
	}

	trimmed := strings.TrimSuffix(key, "/")
	if trimmed == "" {
		return newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_request", "key is invalid", map[string]any{"key": key})
	}
	for _, part := range strings.Split(trimmed, "/") {
		if part == "" {
			continue
		}
		if part == "." || part == ".." {
			return newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_request", "key contains invalid path segment", map[string]any{"key": key})
		}
	}
	return nil
}

func (svc objectCreateFolderHTTPService) prepareCreateObjectFolder(r *http.Request) (models.ProfileSecrets, string, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", "", newObjectCreateFolderHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", "", newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	var req models.CreateFolderRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", "", newObjectCreateFolderHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}

	key := rcloneconfig.NormalizePathInput(req.Key, secrets.PreserveLeadingSlash)
	if err := validateCreateFolderKey(key); err != nil {
		return models.ProfileSecrets{}, "", "", err
	}

	return secrets, bucket, key, nil
}

func (svc objectCreateFolderHTTPService) executeS3Like(r *http.Request, secrets models.ProfileSecrets, bucket string, key string) (*models.CreateFolderResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	err := s3client.PutEmptyObjectWithOptions(r.Context(), secrets, bucket, key, s3client.ProfileOptions{AllowRemote: svc.server.cfg.AllowRemote})
	if err != nil {
		var putErr *s3client.ObjectPutError
		if !errors.As(err, &putErr) {
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectCreateFolderHTTPError(http.StatusInternalServerError, "internal_error", "failed to prepare S3 client", nil)
		}
		providerErr := putErr.Err
		if providerErr == nil {
			providerErr = err
		}
		return nil, providerErr, "", rcloneAPIErrorContext{
				DefaultStatus:  http.StatusBadRequest,
				DefaultCode:    "s3_error",
				DefaultMessage: "failed to create folder",
			}, map[string]any{
				"bucket": bucket,
				"key":    key,
			}, nil
	}
	return &models.CreateFolderResponse{Key: key}, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectCreateFolderHTTPService) executeOCI(r *http.Request, secrets models.ProfileSecrets, bucket string, key string) (*models.CreateFolderResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	markerKey := ociFolderMarkerObjectKey(key)
	stderr, err := svc.server.runRcloneStdin(
		r.Context(),
		secrets,
		[]string{"rcat", rcloneRemoteObject(bucket, markerKey, secrets.PreserveLeadingSlash)},
		"create-folder",
		bytes.NewReader(nil),
	)
	if err != nil {
		return nil, err, stderr, buildObjectCreateFolderRcloneErrorContext(), map[string]any{"bucket": bucket, "key": key, "markerKey": markerKey}, nil
	}
	return &models.CreateFolderResponse{Key: key}, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectCreateFolderHTTPService) executeVisibleMarker(r *http.Request, secrets models.ProfileSecrets, bucket string, key string) (*models.CreateFolderResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	stderr, err := svc.server.runRcloneStdin(
		r.Context(),
		secrets,
		[]string{"rcat", rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)},
		"create-folder",
		bytes.NewReader(nil),
	)
	if err != nil {
		return nil, err, stderr, buildObjectCreateFolderRcloneErrorContext(), map[string]any{"bucket": bucket, "key": key}, nil
	}
	return &models.CreateFolderResponse{Key: key}, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectCreateFolderHTTPService) executeMkdir(r *http.Request, secrets models.ProfileSecrets, bucket string, key string) (*models.CreateFolderResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	_, stderr, err := svc.server.runRcloneCapture(
		r.Context(),
		secrets,
		[]string{"mkdir", rcloneRemoteDir(bucket, key, secrets.PreserveLeadingSlash)},
		"create-folder",
	)
	if err != nil {
		return nil, err, stderr, buildObjectCreateFolderRcloneErrorContext(), map[string]any{"bucket": bucket, "key": key}, nil
	}
	return &models.CreateFolderResponse{Key: key}, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectCreateFolderHTTPService) executeCreate(r *http.Request) (*models.CreateFolderResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, key, err := svc.prepareCreateObjectFolder(r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	if rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return svc.executeS3Like(r, secrets, bucket, key)
	}
	if secrets.Provider == models.ProfileProviderOciObjectStorage {
		return svc.executeOCI(r, secrets, bucket, key)
	}
	if usesVisibleFolderMarker(secrets.Provider) {
		return svc.executeVisibleMarker(r, secrets, bucket, key)
	}
	return svc.executeMkdir(r, secrets, bucket, key)
}

func (svc objectCreateFolderHTTPService) handleCreateObjectFolder(w http.ResponseWriter, r *http.Request) {
	resp, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeCreate(r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusCreated, resp)
		return
	}
	if httpErr, ok := err.(*objectCreateFolderHTTPError); ok {
		respErr := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildAPIErrorResponse("internal_error", "failed to create folder", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type objectMetaHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectMetaHTTPService struct {
	server *server
}

func (e *objectMetaHTTPError) Error() string {
	return e.message
}

func newObjectMetaHTTPService(s *server) objectMetaHTTPService {
	return objectMetaHTTPService{server: s}
}

func newObjectMetaHTTPError(status int, code, message string, details map[string]any) *objectMetaHTTPError {
	return &objectMetaHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectMetaHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func buildObjectMetaFromEntry(key string, entry rcloneListEntry) models.ObjectMeta {
	meta := models.ObjectMeta{
		Key:         key,
		Size:        entry.Size,
		ETag:        rcloneETagFromHashes(entry.Hashes),
		ContentType: entry.MimeType,
		Metadata:    entry.Metadata,
	}
	if entry.IsDir && meta.ContentType == "" {
		meta.ContentType = "application/x-directory"
	}
	if lm := rcloneParseTime(entry.ModTime); lm != "" {
		meta.LastModified = lm
	}
	return meta
}

func (svc objectMetaHTTPService) prepareGetObjectMeta(metric *storageMetric, r *http.Request) (models.ProfileSecrets, string, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		return models.ProfileSecrets{}, "", "", newObjectMetaHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", newObjectMetaHTTPError(http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
	}

	return secrets, bucket, key, nil
}

func (svc objectMetaHTTPService) executeGet(metric *storageMetric, r *http.Request) (*models.ObjectMeta, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, key, err := svc.prepareGetObjectMeta(metric, r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	entry, stderr, err := svc.server.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, true, "object-meta")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectMetaHTTPError(http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
		}
		metric.SetStatus("remote_error")
		return nil, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to fetch object metadata (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to get object metadata",
		}, map[string]any{"bucket": bucket, "key": key}, nil
	}

	meta := buildObjectMetaFromEntry(key, entry)
	metric.SetStatus("success")
	return &meta, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectMetaHTTPService) handleGetObjectMeta(w http.ResponseWriter, r *http.Request) {
	metric := svc.server.beginStorageMetric("unknown", "get_object_meta")
	defer metric.Observe()

	meta, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeGet(metric, r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, meta)
		return
	}
	if httpErr, ok := err.(*objectMetaHTTPError); ok {
		resp := buildObjectMetaHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildObjectMetaHTTPErrorResponse("internal_error", "failed to get object metadata", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

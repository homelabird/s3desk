package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type objectDownloadHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectDownloadHTTPService struct {
	server *server
}

func (e *objectDownloadHTTPError) Error() string {
	return e.message
}

func newObjectDownloadHTTPService(s *server) objectDownloadHTTPService {
	return objectDownloadHTTPService{server: s}
}

func newObjectDownloadHTTPError(status int, code, message string, details map[string]any) *objectDownloadHTTPError {
	return &objectDownloadHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectDownloadRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to download objects (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to download object",
	}
}

func (svc objectDownloadHTTPService) prepareDownloadObject(r *http.Request) (models.ProfileSecrets, string, string, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", "", "", newObjectDownloadHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		return models.ProfileSecrets{}, "", "", "", newObjectDownloadHTTPError(http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
	}

	return secrets, bucket, key, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), nil
}

func (svc objectDownloadHTTPService) executeGet(r *http.Request) (*rcloneProcess, *rcloneListEntry, string, rcloneAPIErrorContext, map[string]any, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, key, target, err := svc.prepareDownloadObject(r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	details := map[string]any{"bucket": bucket, "key": key}
	ctx := buildObjectDownloadRcloneErrorContext()
	entry, stderr, err := svc.server.rcloneStat(r.Context(), secrets, target, true, false, "download-stat")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			return nil, nil, "", rcloneAPIErrorContext{}, nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectDownloadHTTPError(http.StatusNotFound, "not_found", "object not found", details)
		}
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err, stderr, ctx, details, nil
	}

	args := append(svc.server.rcloneDownloadFlags(), "cat", target)
	proc, err := svc.server.startRclone(r.Context(), secrets, args, "download-object")
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err, "", ctx, details, nil
	}

	return proc, &entry, key, ctx, details, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectDownloadHTTPService) handleDownloadObject(w http.ResponseWriter, r *http.Request) {
	proc, entry, key, streamCtx, streamDetails, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeGet(r)
	switch {
	case proc != nil && entry != nil:
		svc.server.streamRcloneDownload(w, proc, *entry, key, streamCtx, streamDetails)
		return
	case rcloneErr != nil:
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	case err == nil:
		resp := buildAPIErrorResponse("internal_error", "failed to download object", nil)
		writeJSON(w, http.StatusInternalServerError, resp)
		return
	default:
		if httpErr, ok := err.(*objectDownloadHTTPError); ok {
			resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
			writeJSON(w, httpErr.status, resp)
			return
		}
		resp := buildAPIErrorResponse("internal_error", "failed to download object", nil)
		writeJSON(w, http.StatusInternalServerError, resp)
	}
}

package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type downloadProxyHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type downloadProxyPreparedRequest struct {
	method    string
	profileID string
	bucket    string
	key       string
	token     downloadProxyToken
	err       error
}

type downloadProxyHTTPService struct {
	server *server
	now    func() time.Time
}

func (e *downloadProxyHTTPError) Error() string {
	return e.message
}

func newDownloadProxyHTTPService(s *server) downloadProxyHTTPService {
	return downloadProxyHTTPService{server: s, now: time.Now}
}

func newDownloadProxyHTTPError(status int, code, message string, details map[string]any) *downloadProxyHTTPError {
	return &downloadProxyHTTPError{status: status, code: code, message: message, details: details}
}

func buildDownloadProxyHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func buildDownloadProxyRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to download objects (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to download object",
	}
}

func (svc downloadProxyHTTPService) currentTime() time.Time {
	if svc.now != nil {
		return svc.now().UTC()
	}
	return time.Now().UTC()
}

func (svc downloadProxyHTTPService) prepareDownloadProxy(r *http.Request) downloadProxyPreparedRequest {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return downloadProxyPreparedRequest{method: r.Method, err: newDownloadProxyHTTPError(http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed", nil)}
	}

	profileID := strings.TrimSpace(r.URL.Query().Get("profileId"))
	bucket := strings.TrimSpace(r.URL.Query().Get("bucket"))
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	expiresRaw := strings.TrimSpace(r.URL.Query().Get("expires"))
	sizeRaw := strings.TrimSpace(r.URL.Query().Get("size"))
	sig := strings.TrimSpace(r.URL.Query().Get("sig"))
	size, contentType, lastModified, err := parseDownloadProxyMetadataHints(sizeRaw, r.URL.Query().Get("contentType"), r.URL.Query().Get("lastModified"))
	if err != nil {
		return downloadProxyPreparedRequest{method: r.Method, err: newDownloadProxyHTTPError(http.StatusBadRequest, "invalid_request", err.Error(), map[string]any{"size": sizeRaw})}
	}

	if profileID == "" || bucket == "" || key == "" || expiresRaw == "" || sig == "" {
		return downloadProxyPreparedRequest{method: r.Method, err: newDownloadProxyHTTPError(http.StatusBadRequest, "invalid_request", "profileId, bucket, key, expires, sig are required", nil)}
	}

	expiresAt, err := strconv.ParseInt(expiresRaw, 10, 64)
	if err != nil || expiresAt <= 0 {
		return downloadProxyPreparedRequest{method: r.Method, err: newDownloadProxyHTTPError(http.StatusBadRequest, "invalid_request", "expires is invalid", map[string]any{"expires": expiresRaw})}
	}
	if svc.currentTime().Unix() > expiresAt {
		return downloadProxyPreparedRequest{method: r.Method, err: newDownloadProxyHTTPError(http.StatusForbidden, "expired", "download link expired", nil)}
	}

	token := downloadProxyToken{
		ProfileID:    profileID,
		Bucket:       bucket,
		Key:          key,
		Expires:      expiresAt,
		Size:         size,
		ContentType:  contentType,
		LastModified: lastModified,
	}
	if !svc.server.verifyDownloadProxy(token, sig) {
		return downloadProxyPreparedRequest{method: r.Method, err: newDownloadProxyHTTPError(http.StatusForbidden, "invalid_signature", "download signature is invalid", nil)}
	}

	return downloadProxyPreparedRequest{
		method:    r.Method,
		profileID: profileID,
		bucket:    bucket,
		key:       key,
		token:     token,
	}
}

func (svc downloadProxyHTTPService) executePrepared(r *http.Request, prepared downloadProxyPreparedRequest) (int, *rcloneListEntry, string, *rcloneProcess, error, string, rcloneAPIErrorContext, map[string]any, error) {
	if prepared.err != nil {
		if httpErr, ok := prepared.err.(*downloadProxyHTTPError); ok && httpErr.status == http.StatusMethodNotAllowed {
			return http.StatusMethodNotAllowed, nil, "", nil, nil, "", rcloneAPIErrorContext{}, nil, nil
		}
		return 0, nil, "", nil, nil, "", rcloneAPIErrorContext{}, nil, prepared.err
	}

	secrets, ok, err := svc.server.store.GetProfileSecrets(r.Context(), prepared.profileID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrEncryptedCredentials):
			return 0, nil, "", nil, nil, "", rcloneAPIErrorContext{}, nil, newDownloadProxyHTTPError(http.StatusBadRequest, "encrypted_credentials", err.Error(), nil)
		case errors.Is(err, store.ErrEncryptionKeyRequired):
			return 0, nil, "", nil, nil, "", rcloneAPIErrorContext{}, nil, newDownloadProxyHTTPError(http.StatusBadRequest, "encryption_required", err.Error(), nil)
		default:
			return 0, nil, "", nil, nil, "", rcloneAPIErrorContext{}, nil, newDownloadProxyHTTPError(http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
		}
	}
	if !ok {
		return 0, nil, "", nil, nil, "", rcloneAPIErrorContext{}, nil, newDownloadProxyHTTPError(http.StatusNotFound, "profile_not_found", "profile not found", map[string]any{"profileId": prepared.profileID})
	}

	details := map[string]any{"bucket": prepared.bucket, "key": prepared.key}
	ctx := buildDownloadProxyRcloneErrorContext()
	entry, hasEmbeddedMetadata, stderr, err := svc.server.resolveDownloadProxyEntry(r.Context(), secrets, prepared.token, prepared.bucket, prepared.key)
	if hasEmbeddedMetadata {
		if svc.server.metrics != nil {
			svc.server.metrics.IncDownloadProxyMode("stat_skipped")
		}
	} else {
		if svc.server.metrics != nil {
			svc.server.metrics.IncDownloadProxyMode("stat_required")
		}
		if err != nil {
			if rcloneIsNotFound(err, stderr) {
				return 0, nil, "", nil, nil, "", rcloneAPIErrorContext{}, nil, newDownloadProxyHTTPError(http.StatusNotFound, "not_found", "object not found", details)
			}
			return 0, nil, "", nil, err, stderr, ctx, details, nil
		}
	}

	if prepared.method == http.MethodHead {
		return 0, &entry, prepared.key, nil, nil, "", rcloneAPIErrorContext{}, nil, nil
	}

	args := append(svc.server.rcloneDownloadFlags(), "cat", rcloneRemoteObject(prepared.bucket, prepared.key, secrets.PreserveLeadingSlash))
	proc, err := svc.server.startRclone(r.Context(), secrets, args, "download-proxy")
	if err != nil {
		return 0, nil, "", nil, err, "", ctx, details, nil
	}
	return 0, &entry, prepared.key, proc, nil, "", ctx, details, nil
}

func (svc downloadProxyHTTPService) executeProxy(r *http.Request) (int, *rcloneListEntry, string, *rcloneProcess, error, string, rcloneAPIErrorContext, map[string]any, error) {
	return svc.executePrepared(r, svc.prepareDownloadProxy(r))
}

func (svc downloadProxyHTTPService) handleDownloadProxy(w http.ResponseWriter, r *http.Request) {
	statusOnly, entry, key, proc, rcloneErr, rcloneStderr, rcloneCtx, rcloneDetails, err := svc.executeProxy(r)
	switch {
	case statusOnly != 0:
		w.WriteHeader(statusOnly)
	case entry != nil && proc == nil:
		applyDownloadHeaders(w.Header(), *entry, key)
		w.WriteHeader(http.StatusOK)
	case entry != nil && proc != nil:
		svc.server.streamRcloneDownload(w, proc, *entry, key, rcloneCtx, rcloneDetails)
	case rcloneErr != nil:
		writeRcloneAPIError(w, rcloneErr, rcloneStderr, rcloneCtx, rcloneDetails)
	case err == nil:
		resp := buildDownloadProxyHTTPErrorResponse("internal_error", "failed to proxy download", nil)
		writeJSON(w, http.StatusInternalServerError, resp)
	default:
		if httpErr, ok := err.(*downloadProxyHTTPError); ok {
			resp := buildDownloadProxyHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
			writeJSON(w, httpErr.status, &resp)
		} else {
			resp := buildDownloadProxyHTTPErrorResponse("internal_error", "failed to proxy download", nil)
			writeJSON(w, http.StatusInternalServerError, &resp)
		}
	}
}

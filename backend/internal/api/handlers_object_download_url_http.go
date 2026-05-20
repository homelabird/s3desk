package api

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type objectDownloadURLHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectDownloadURLHTTPService struct {
	server *server
}

func (e *objectDownloadURLHTTPError) Error() string {
	return e.message
}

func newObjectDownloadURLHTTPService(s *server) objectDownloadURLHTTPService {
	return objectDownloadURLHTTPService{server: s}
}

func newObjectDownloadURLHTTPError(status int, code, message string, details map[string]any) *objectDownloadURLHTTPError {
	return &objectDownloadURLHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectDownloadURLHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func buildObjectDownloadURLResponse(url string, expires time.Duration, now time.Time) models.PresignedURLResponse {
	return models.PresignedURLResponse{
		URL:       url,
		ExpiresAt: now.UTC().Add(expires).Format(time.RFC3339Nano),
	}
}

func parseDownloadProxyBool(raw string) (bool, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	switch raw {
	case "":
		return false, nil
	case "1", "true", "t", "yes", "y", "on":
		return true, nil
	case "0", "false", "f", "no", "n", "off":
		return false, nil
	default:
		return false, fmt.Errorf("proxy must be a boolean")
	}
}

func firstNonEmptyLine(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			return line
		}
	}
	return ""
}

func (svc objectDownloadURLHTTPService) prepareGetObjectDownloadURL(metric *storageMetric, r *http.Request) (models.ProfileSecrets, string, string, time.Duration, int, bool, int64, string, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		return models.ProfileSecrets{}, "", "", 0, 0, false, 0, "", "", newObjectDownloadURLHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", 0, 0, false, 0, "", "", newObjectDownloadURLHTTPError(http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
	}

	expiresSeconds, err := parseIntQueryClamped(r, "expiresSeconds", 900, 60, 3600)
	if err != nil {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", 0, 0, false, 0, "", "", newObjectDownloadURLHTTPError(http.StatusBadRequest, "invalid_request", "expiresSeconds is invalid", map[string]any{"expiresSeconds": r.URL.Query().Get("expiresSeconds")})
	}
	expires := time.Duration(expiresSeconds) * time.Second
	proxyRaw := strings.TrimSpace(r.URL.Query().Get("proxy"))
	useProxy, err := parseDownloadProxyBool(proxyRaw)
	if err != nil {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", 0, 0, false, 0, "", "", newObjectDownloadURLHTTPError(http.StatusBadRequest, "invalid_request", "proxy must be a boolean", map[string]any{"proxy": proxyRaw})
	}
	sizeRaw := strings.TrimSpace(r.URL.Query().Get("size"))
	sizeHint, contentType, lastModified, err := parseDownloadProxyMetadataHints(sizeRaw, r.URL.Query().Get("contentType"), r.URL.Query().Get("lastModified"))
	if err != nil {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", 0, 0, false, 0, "", "", newObjectDownloadURLHTTPError(http.StatusBadRequest, "invalid_request", err.Error(), map[string]any{"size": sizeRaw})
	}

	return secrets, bucket, key, expires, expiresSeconds, useProxy, sizeHint, contentType, lastModified, nil
}

func (svc objectDownloadURLHTTPService) executeGet(metric *storageMetric, r *http.Request) (*models.PresignedURLResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, key, expires, expiresSecs, useProxy, sizeHint, contentType, lastModified, err := svc.prepareGetObjectDownloadURL(metric, r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}

	if useProxy {
		resp, err := svc.server.buildProxiedObjectDownloadURL(r, secrets, bucket, key, expires, sizeHint, contentType, lastModified)
		if err != nil {
			metric.SetStatus("missing_profile")
			message := "failed to generate download url"
			code := "invalid_request"
			if errors.Is(err, errDownloadProxyProfileRequired) {
				code = "missing_profile"
				message = "X-Profile-Id header is required"
			}
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectDownloadURLHTTPError(http.StatusBadRequest, code, message, nil)
		}
		metric.SetStatus("proxy_only")
		return &resp, nil, "", rcloneAPIErrorContext{}, nil, nil
	}

	if secrets.Provider == models.ProfileProviderAwsS3 || secrets.Provider == models.ProfileProviderS3Compatible {
		presigner, err := s3PresignClientFromProfile(secrets, svc.server.cfg.AllowRemote)
		if err != nil {
			metric.SetStatus("internal_error")
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectDownloadURLHTTPError(http.StatusInternalServerError, "internal_error", "failed to prepare download presigner", nil)
		}
		resp, err := presigner.PresignGetObject(
			r.Context(),
			&s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)},
			s3.WithPresignExpires(expires),
		)
		if err != nil {
			metric.SetStatus("remote_error")
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectDownloadURLHTTPError(http.StatusBadRequest, "invalid_request", "failed to generate download url", map[string]any{"bucket": bucket, "key": key, "error": err.Error()})
		}
		out := buildObjectDownloadURLResponse(resp.URL, expires, time.Now())
		metric.SetStatus("success")
		return &out, nil, "", rcloneAPIErrorContext{}, nil, nil
	}

	expireArg := fmt.Sprintf("%ds", expiresSecs)
	args := []string{"link", "--expire", expireArg, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)}
	out, stderr, err := svc.server.runRcloneCapture(r.Context(), secrets, args, "download-url")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectDownloadURLHTTPError(http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
		}
		metric.SetStatus("remote_error")
		return nil, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to generate download URLs (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "invalid_request",
			DefaultMessage: "failed to generate download url",
		}, map[string]any{"bucket": bucket, "key": key}, nil
	}

	url := firstNonEmptyLine(out)
	if url == "" {
		metric.SetStatus("internal_error")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectDownloadURLHTTPError(http.StatusBadRequest, "invalid_request", "failed to generate download url", map[string]any{"error": "empty rclone response"})
	}

	resp := buildObjectDownloadURLResponse(url, expires, time.Now())
	metric.SetStatus("success")
	return &resp, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectDownloadURLHTTPService) handleGetObjectDownloadURL(w http.ResponseWriter, r *http.Request) {
	metric := svc.server.beginStorageMetric("unknown", "get_download_url")
	defer metric.Observe()

	resp, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeGet(metric, r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if httpErr, ok := err.(*objectDownloadURLHTTPError); ok {
		respErr := buildObjectDownloadURLHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildObjectDownloadURLHTTPErrorResponse("internal_error", "failed to generate download url", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

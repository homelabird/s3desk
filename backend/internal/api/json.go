package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"s3desk/internal/models"
)

const (
	defaultJSONRequestBodyMaxBytes         int64 = 4 << 20
	uploadCommitJSONRequestBodyMaxBytes          = 8 << 20
	uploadMultipartJSONRequestBodyMaxBytes       = 4 << 20
)

var (
	errJSONBodyTooLarge = errors.New("json request body too large")
	errJSONTrailingData = errors.New("json request body must contain a single JSON value")
)

type jsonDecodeOptions struct {
	maxBytes   int64
	allowEmpty bool
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string, details map[string]any) {
	resp := models.ErrorResponse{
		Error: models.APIError{
			Code:    code,
			Message: message,
			Details: details,
		},
	}

	// If this is a stable, provider-agnostic code, surface it in `normalizedError` as well.
	// This keeps UX logic consistent even for non-rclone errors (e.g., preflight invalid_config).
	if resp.Error.NormalizedError == nil {
		if norm, ok := normalizedErrorFromCode(code); ok {
			resp.Error.NormalizedError = norm
		}
	}
	// Hint clients when backoff makes sense (e.g., rate limiting).
	if resp.Error.NormalizedError != nil && resp.Error.NormalizedError.Code == models.NormalizedErrorRateLimited {
		if w.Header().Get("Retry-After") == "" {
			w.Header().Set("Retry-After", "3")
		}
	}
	writeJSON(w, status, resp)
}

func normalizedErrorFromCode(code string) (*models.NormalizedError, bool) {
	// Default retry semantics: only network-ish conditions should be retried automatically.
	switch code {
	// Aliases: API-specific codes that still map cleanly to the normalized taxonomy.
	case "bucket_not_empty":
		return &models.NormalizedError{Code: models.NormalizedErrorConflict, Retryable: false}, true
	case "job_queue_full":
		return &models.NormalizedError{Code: models.NormalizedErrorRateLimited, Retryable: true}, true
	case "profile_not_found":
		return &models.NormalizedError{Code: models.NormalizedErrorNotFound, Retryable: false}, true
	case string(models.NormalizedErrorInvalidCredentials):
		return &models.NormalizedError{Code: models.NormalizedErrorInvalidCredentials, Retryable: false}, true
	case string(models.NormalizedErrorAccessDenied):
		return &models.NormalizedError{Code: models.NormalizedErrorAccessDenied, Retryable: false}, true
	case string(models.NormalizedErrorNotFound):
		return &models.NormalizedError{Code: models.NormalizedErrorNotFound, Retryable: false}, true
	case string(models.NormalizedErrorRateLimited):
		return &models.NormalizedError{Code: models.NormalizedErrorRateLimited, Retryable: true}, true
	case string(models.NormalizedErrorNetworkError):
		return &models.NormalizedError{Code: models.NormalizedErrorNetworkError, Retryable: true}, true
	case string(models.NormalizedErrorInvalidConfig):
		return &models.NormalizedError{Code: models.NormalizedErrorInvalidConfig, Retryable: false}, true
	case string(models.NormalizedErrorSignatureMismatch):
		return &models.NormalizedError{Code: models.NormalizedErrorSignatureMismatch, Retryable: false}, true
	case string(models.NormalizedErrorRequestTimeSkewed):
		return &models.NormalizedError{Code: models.NormalizedErrorRequestTimeSkewed, Retryable: false}, true
	case string(models.NormalizedErrorConflict):
		return &models.NormalizedError{Code: models.NormalizedErrorConflict, Retryable: false}, true
	case string(models.NormalizedErrorUpstreamTimeout):
		return &models.NormalizedError{Code: models.NormalizedErrorUpstreamTimeout, Retryable: true}, true
	case string(models.NormalizedErrorEndpointUnreachable):
		return &models.NormalizedError{Code: models.NormalizedErrorEndpointUnreachable, Retryable: true}, true
	case string(models.NormalizedErrorCanceled):
		return &models.NormalizedError{Code: models.NormalizedErrorCanceled, Retryable: false}, true
	case string(models.NormalizedErrorUnknown):
		return &models.NormalizedError{Code: models.NormalizedErrorUnknown, Retryable: false}, true
	default:
		return nil, false
	}
}

func decodeJSON(r *http.Request, dst any) error {
	return decodeJSONWithOptions(r, dst, jsonDecodeOptions{maxBytes: defaultJSONRequestBodyMaxBytes})
}

func decodeJSONWithOptions(r *http.Request, dst any, opts jsonDecodeOptions) error {
	maxBytes := opts.maxBytes
	if maxBytes <= 0 {
		maxBytes = defaultJSONRequestBodyMaxBytes
	}
	if r == nil || r.Body == nil {
		if opts.allowEmpty {
			return nil
		}
		return io.EOF
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
	if err != nil {
		return err
	}
	if int64(len(body)) > maxBytes {
		return errJSONBodyTooLarge
	}
	if len(bytes.TrimSpace(body)) == 0 {
		if opts.allowEmpty {
			return nil
		}
		return io.EOF
	}

	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	var extra json.RawMessage
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errJSONTrailingData
		}
		return err
	}
	return nil
}

func writeJSONDecodeError(w http.ResponseWriter, err error, maxBytes int64) {
	if errors.Is(err, errJSONBodyTooLarge) {
		if maxBytes <= 0 {
			maxBytes = defaultJSONRequestBodyMaxBytes
		}
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "request body too large", map[string]any{"maxBytes": maxBytes})
		return
	}
	writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
}

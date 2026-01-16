package jobs

import (
	"errors"
	"fmt"
	"s3desk/internal/rcloneerrors"
	"strings"
)

const (
	// Transfer engine (rclone) availability / compatibility.
	ErrorCodeTransferEngineMissing      = "transfer_engine_missing"
	ErrorCodeTransferEngineIncompatible = "transfer_engine_incompatible"

	ErrorCodeInvalidCredentials  = "invalid_credentials" // #nosec G101 -- error code, not credentials
	ErrorCodeAccessDenied        = "access_denied"
	ErrorCodeSignatureMismatch   = "signature_mismatch"
	ErrorCodeRequestTimeSkewed   = "request_time_skewed"
	ErrorCodeEndpointUnreachable = "endpoint_unreachable"
	ErrorCodeUpstreamTimeout     = "upstream_timeout"
	ErrorCodeNetworkError        = "network_error"
	ErrorCodeNotFound            = "not_found"
	ErrorCodeConflict            = "conflict"
	ErrorCodeRateLimited         = "rate_limited"
	ErrorCodeInvalidConfig       = "invalid_config"
	ErrorCodeCanceled            = "canceled"
	ErrorCodeServerRestarted     = "server_restarted"
	ErrorCodeValidation          = "validation_error"
	ErrorCodeUnknown             = "unknown"
)

type jobError struct {
	code    string
	message string
	cause   error
}

func (e *jobError) Error() string {
	return e.message
}

func (e *jobError) Unwrap() error {
	return e.cause
}

func newJobError(code, message string, cause error) error {
	return &jobError{code: code, message: message, cause: cause}
}

func jobErrorCode(err error) (string, bool) {
	var je *jobError
	if errors.As(err, &je) {
		return je.code, true
	}
	return "", false
}

func jobErrorMessage(err error, stderr string) string {
	msg := strings.TrimSpace(stderr)
	if msg != "" {
		return msg
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func jobErrorFromRclone(err error, stderr string, context string) error {
	msg := jobErrorMessage(err, stderr)
	if msg == "" {
		msg = "rclone failed"
	}
	if context != "" {
		msg = context + ": " + msg
	}
	code := classifyRcloneError(err, stderr)
	if code == "" {
		code = ErrorCodeUnknown
	}
	return newJobError(code, FormatJobErrorMessage(msg, code), err)
}

func classifyRcloneError(err error, stderr string) string {
	cls := rcloneerrors.Classify(err, stderr)
	if cls.Code == rcloneerrors.CodeUnknown {
		return ""
	}
	return string(cls.Code)
}

func FormatJobErrorMessage(message, code string) string {
	msg := strings.TrimSpace(message)
	code = strings.TrimSpace(code)
	if msg == "" || code == "" {
		return msg
	}
	if strings.Contains(msg, code) {
		return msg
	}
	return fmt.Sprintf("[%s] %s", code, msg)
}

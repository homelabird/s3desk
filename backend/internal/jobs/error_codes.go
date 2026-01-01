package jobs

import (
	"errors"
	"fmt"
	"strings"
)

const (
	ErrorCodeInvalidCredentials  = "invalid_credentials"
	ErrorCodeAccessDenied        = "access_denied"
	ErrorCodeSignatureMismatch   = "signature_mismatch"
	ErrorCodeRequestTimeSkewed   = "request_time_skewed"
	ErrorCodeEndpointUnreachable = "endpoint_unreachable"
	ErrorCodeUpstreamTimeout     = "upstream_timeout"
	ErrorCodeNetworkError        = "network_error"
	ErrorCodeNotFound            = "not_found"
	ErrorCodeConflict            = "conflict"
	ErrorCodeRateLimited         = "rate_limited"
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

func validationError(message string) error {
	return newJobError(ErrorCodeValidation, message, nil)
}

func notFoundError(message string) error {
	return newJobError(ErrorCodeNotFound, message, nil)
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
	msg := strings.ToLower(jobErrorMessage(err, stderr))
	if msg == "" {
		return ""
	}
	switch {
	case rcloneIsNotFound(msg):
		return ErrorCodeNotFound
	case rcloneIsSignatureMismatch(msg):
		return ErrorCodeSignatureMismatch
	case rcloneIsInvalidCredentials(msg):
		return ErrorCodeInvalidCredentials
	case rcloneIsAccessDenied(msg):
		return ErrorCodeAccessDenied
	case rcloneIsRequestTimeSkewed(msg):
		return ErrorCodeRequestTimeSkewed
	case rcloneIsRateLimited(msg):
		return ErrorCodeRateLimited
	case rcloneIsConflict(msg):
		return ErrorCodeConflict
	case rcloneIsTimeout(msg):
		return ErrorCodeUpstreamTimeout
	case rcloneIsEndpointError(msg):
		return ErrorCodeEndpointUnreachable
	case rcloneIsNetworkError(msg):
		return ErrorCodeNetworkError
	default:
		return ""
	}
}

func rcloneIsNotFound(msg string) bool {
	switch {
	case strings.Contains(msg, "not found"):
		return true
	case strings.Contains(msg, "no such file") || strings.Contains(msg, "no such key"):
		return true
	case strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "nosuchbucket"):
		return true
	case strings.Contains(msg, "404"):
		return true
	default:
		return false
	}
}

func rcloneIsAccessDenied(msg string) bool {
	switch {
	case strings.Contains(msg, "accessdenied") || strings.Contains(msg, "access denied"):
		return true
	case strings.Contains(msg, "permission denied"):
		return true
	case strings.Contains(msg, "forbidden"):
		return true
	case strings.Contains(msg, "status 403") || strings.Contains(msg, "error 403"):
		return true
	default:
		return false
	}
}

func rcloneIsInvalidCredentials(msg string) bool {
	switch {
	case strings.Contains(msg, "invalidaccesskeyid"):
		return true
	case strings.Contains(msg, "access key id you provided does not exist"):
		return true
	case strings.Contains(msg, "invalid access key"):
		return true
	case strings.Contains(msg, "invalidtoken") || strings.Contains(msg, "expiredtoken"):
		return true
	case strings.Contains(msg, "security token") && strings.Contains(msg, "invalid"):
		return true
	default:
		return false
	}
}

func rcloneIsSignatureMismatch(msg string) bool {
	switch {
	case strings.Contains(msg, "signaturedoesnotmatch"):
		return true
	case strings.Contains(msg, "signature does not match"):
		return true
	case strings.Contains(msg, "request signature we calculated does not match"):
		return true
	case strings.Contains(msg, "invalid signature"):
		return true
	case strings.Contains(msg, "authorizationheader malformed"):
		return true
	default:
		return false
	}
}

func rcloneIsRequestTimeSkewed(msg string) bool {
	return strings.Contains(msg, "request time too skewed") || strings.Contains(msg, "requesttime")
}

func rcloneIsRateLimited(msg string) bool {
	switch {
	case strings.Contains(msg, "rate limit"):
		return true
	case strings.Contains(msg, "too many requests"):
		return true
	case strings.Contains(msg, "slow down"):
		return true
	case strings.Contains(msg, "throttle") || strings.Contains(msg, "throttl"):
		return true
	case strings.Contains(msg, "status 429") || strings.Contains(msg, "error 429"):
		return true
	default:
		return false
	}
}

func rcloneIsConflict(msg string) bool {
	switch {
	case strings.Contains(msg, "conflict"):
		return true
	case strings.Contains(msg, "already exists"):
		return true
	case strings.Contains(msg, "precondition failed"):
		return true
	case strings.Contains(msg, "status 409") || strings.Contains(msg, "error 409"):
		return true
	case strings.Contains(msg, "status 412") || strings.Contains(msg, "error 412"):
		return true
	default:
		return false
	}
}

func rcloneIsTimeout(msg string) bool {
	return strings.Contains(msg, "timeout") || strings.Contains(msg, "context deadline exceeded")
}

func rcloneIsEndpointError(msg string) bool {
	switch {
	case strings.Contains(msg, "no such host"):
		return true
	case strings.Contains(msg, "temporary failure in name resolution"):
		return true
	case strings.Contains(msg, "connection refused"):
		return true
	case strings.Contains(msg, "connection reset"):
		return true
	case strings.Contains(msg, "dial tcp"):
		return true
	case strings.Contains(msg, "tls:") || strings.Contains(msg, "x509:"):
		return true
	default:
		return false
	}
}

func rcloneIsNetworkError(msg string) bool {
	switch {
	case strings.Contains(msg, "broken pipe"):
		return true
	case strings.Contains(msg, "connection closed"):
		return true
	case strings.Contains(msg, "connection aborted"):
		return true
	case strings.Contains(msg, "unexpected eof"):
		return true
	case strings.Contains(msg, "network error"):
		return true
	default:
		return false
	}
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

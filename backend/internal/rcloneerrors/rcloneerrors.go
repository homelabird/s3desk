package rcloneerrors

import (
	"context"
	"errors"
	"strings"
)

// Code is a normalized error code derived from rclone stderr.
//
// IMPORTANT: These codes are meant to be provider-agnostic.
// Do not add provider-specific values here.
type Code string

const (
	CodeInvalidCredentials Code = "invalid_credentials" // #nosec G101 -- error code, not credentials
	CodeAccessDenied       Code = "access_denied"
	CodeNotFound           Code = "not_found"
	CodeRateLimited        Code = "rate_limited"
	CodeInvalidConfig      Code = "invalid_config"

	// Additional (still provider-agnostic) codes that are handy for UX.
	CodeSignatureMismatch   Code = "signature_mismatch"
	CodeRequestTimeSkewed   Code = "request_time_skewed"
	CodeConflict            Code = "conflict"
	CodeUpstreamTimeout     Code = "upstream_timeout"
	CodeEndpointUnreachable Code = "endpoint_unreachable"
	CodeNetworkError        Code = "network_error"
	CodeCanceled            Code = "canceled"
	CodeUnknown             Code = "unknown"
)

type Classification struct {
	Code      Code
	Retryable bool
}

func Message(err error, stderr string) string {
	if msg := strings.TrimSpace(stderr); msg != "" {
		return msg
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

// Classify attempts to map rclone failures to a stable, provider-agnostic code.
// It relies on best-effort substring checks because rclone backends emit wildly
// inconsistent messages.
func Classify(err error, stderr string) Classification {
	if errors.Is(err, context.Canceled) {
		return Classification{Code: CodeCanceled, Retryable: false}
	}

	msg := strings.ToLower(Message(err, stderr))
	if strings.TrimSpace(msg) == "" {
		return Classification{Code: CodeUnknown, Retryable: false}
	}

	// Order matters: some backends include "not found" in messages that are really
	// config errors, and some include "not found" in permission errors.
	switch {
	case IsInvalidConfig(msg):
		return Classification{Code: CodeInvalidConfig, Retryable: false}
	case IsSignatureMismatch(msg):
		return Classification{Code: CodeSignatureMismatch, Retryable: false}
	case IsInvalidCredentials(msg):
		return Classification{Code: CodeInvalidCredentials, Retryable: false}
	case IsAccessDenied(msg):
		return Classification{Code: CodeAccessDenied, Retryable: false}
	case IsNotFound(msg):
		return Classification{Code: CodeNotFound, Retryable: false}
	case IsRequestTimeSkewed(msg):
		// In theory retryable after time sync, but not an automatic retry.
		return Classification{Code: CodeRequestTimeSkewed, Retryable: false}
	case IsRateLimited(msg):
		return Classification{Code: CodeRateLimited, Retryable: true}
	case IsConflict(msg):
		return Classification{Code: CodeConflict, Retryable: false}
	case IsTimeout(msg):
		return Classification{Code: CodeUpstreamTimeout, Retryable: true}
	case IsEndpointUnreachable(msg):
		return Classification{Code: CodeEndpointUnreachable, Retryable: true}
	case IsNetworkError(msg):
		return Classification{Code: CodeNetworkError, Retryable: true}
	default:
		return Classification{Code: CodeUnknown, Retryable: false}
	}
}

func IsNotFound(msgLower string) bool {
	msg := msgLower
	switch {
	case strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "no such key"):
		return true
	case strings.Contains(msg, "nosuchbucket") || strings.Contains(msg, "no such bucket"):
		return true
	case strings.Contains(msg, "containernotfound") || strings.Contains(msg, "container not found"):
		return true
	case strings.Contains(msg, "blobnotfound") || strings.Contains(msg, "blob not found"):
		return true

	case strings.Contains(msg, "notfound"):
		return true
	case strings.Contains(msg, "resourcenotfound"):
		return true
	case strings.Contains(msg, "the specified container does not exist"):
		return true
	case strings.Contains(msg, "the specified bucket does not exist"):
		return true
	case strings.Contains(msg, "not found"):
		return true
	case strings.Contains(msg, "no such file"):
		return true
	case strings.Contains(msg, "status 404") || strings.Contains(msg, "error 404"):
		return true
	case strings.Contains(msg, " 404"):
		return true
	default:
		return false
	}
}

func IsAccessDenied(msgLower string) bool {
	msg := msgLower
	switch {
	case strings.Contains(msg, "accessdenied") || strings.Contains(msg, "access denied"):
		return true
	case strings.Contains(msg, "permission denied"):
		return true
	case strings.Contains(msg, "forbidden"):
		return true
	case strings.Contains(msg, "authorizationpermissionmismatch"):
		return true
	case strings.Contains(msg, "notauthorizedornotfound"):
		return true
	case strings.Contains(msg, "not authorized"):
		return true

	case strings.Contains(msg, "authorizationfailure"):
		return true
	case strings.Contains(msg, "authorization failed"):
		return true
	case strings.Contains(msg, "account is disabled"):
		return true
	case strings.Contains(msg, "permissiondenied"):
		return true
	case strings.Contains(msg, "insufficientpermissions"):
		return true
	case strings.Contains(msg, "does not have") && strings.Contains(msg, " access"):
		return true
	case strings.Contains(msg, "status 403") || strings.Contains(msg, "error 403"):
		return true
	default:
		return false
	}
}

func IsInvalidCredentials(msgLower string) bool {
	msg := msgLower
	switch {
	// AWS/S3
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

	// Azure
	case strings.Contains(msg, "authenticationfailed"):
		return true
	case strings.Contains(msg, "invalidauthenticationinfo"):
		return true
	case strings.Contains(msg, "failed to authenticate"):
		return true

	// GCP OAuth
	case strings.Contains(msg, "invalid_grant"):
		return true
	case strings.Contains(msg, "oauth2:") && strings.Contains(msg, "token"):
		return true

	// OCI
	case strings.Contains(msg, "notauthenticated"):
		return true

	// Azure (more variants)
	case strings.Contains(msg, "server failed to authenticate the request"):
		return true

	// Generic 401
	case strings.Contains(msg, "unauthorized"):
		return true
	case strings.Contains(msg, "status 401") || strings.Contains(msg, "error 401"):
		return true
	default:
		return false
	}
}

func IsSignatureMismatch(msgLower string) bool {
	msg := msgLower
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

func IsRequestTimeSkewed(msgLower string) bool {
	msg := msgLower
	return strings.Contains(msg, "request time too skewed") || strings.Contains(msg, "requesttime")
}

func IsRateLimited(msgLower string) bool {
	msg := msgLower
	switch {
	// Generic
	case strings.Contains(msg, "rate limit"):
		return true
	case strings.Contains(msg, "too many requests"):
		return true
	case strings.Contains(msg, "toomanyrequests"):
		return true

	case strings.Contains(msg, "status 429") || strings.Contains(msg, "error 429"):
		return true

	// AWS/S3
	case strings.Contains(msg, "slowdown") || strings.Contains(msg, "slow down"):
		return true
	case strings.Contains(msg, "requestlimitexceeded"):
		return true
	case strings.Contains(msg, "throttle") || strings.Contains(msg, "throttl"):
		return true

	// Azure
	case strings.Contains(msg, "serverbusy"):
		return true

	// GCP
	case strings.Contains(msg, "ratelimitexceeded"):
		return true
	case strings.Contains(msg, "userratelimitexceeded"):
		return true
	case strings.Contains(msg, "resourceexhausted"):
		return true
	case strings.Contains(msg, "quota") && strings.Contains(msg, "exceed"):
		return true
	default:
		return false
	}
}

func IsBucketNotEmpty(msgLower string) bool {
	msg := msgLower
	switch {
	case strings.Contains(msg, "bucketnotempty"):
		return true
	case strings.Contains(msg, "bucket not empty"):
		return true
	case strings.Contains(msg, "directory not empty"):
		return true
	case strings.Contains(msg, "not empty") && strings.Contains(msg, "bucket"):
		return true
	default:
		return false
	}
}

func IsConflict(msgLower string) bool {
	msg := msgLower
	switch {
	case IsBucketNotEmpty(msg):
		return true
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

func IsTimeout(msgLower string) bool {
	msg := msgLower
	return strings.Contains(msg, "timeout") || strings.Contains(msg, "context deadline exceeded") || strings.Contains(msg, "i/o timeout")
}

func IsEndpointUnreachable(msgLower string) bool {
	msg := msgLower
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

func IsNetworkError(msgLower string) bool {
	msg := msgLower
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
	case strings.TrimSpace(msg) == "eof":
		return true
	default:
		return false
	}
}

func IsInvalidConfig(msgLower string) bool {
	msg := msgLower
	switch {
	case strings.Contains(msg, "didn't find section") && strings.Contains(msg, "config"):
		return true
	case strings.Contains(msg, "did not find section") && strings.Contains(msg, "config"):
		return true
	case strings.Contains(msg, "section") && strings.Contains(msg, "not found") && strings.Contains(msg, "config"):
		return true
	case strings.Contains(msg, "unknown backend"):
		return true
	case strings.Contains(msg, "unknown remote"):
		return true
	case strings.Contains(msg, "failed to configure") && strings.Contains(msg, "backend"):
		return true
	case strings.Contains(msg, "failed to create file system"):
		return true
	case strings.Contains(msg, "config file") && strings.Contains(msg, "not found"):
		return true
	case strings.Contains(msg, "invalid configuration"):
		return true
	case strings.Contains(msg, "couldn't parse") && strings.Contains(msg, "config"):
		return true

	case strings.Contains(msg, "bad configuration"):
		return true
	case strings.Contains(msg, "bad config"):
		return true
	default:
		return false
	}
}

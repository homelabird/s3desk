package rcloneerrors

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestClassify_CodesAndRetryable(t *testing.T) {
	cases := []struct {
		name      string
		err       error
		stderr    string
		wantCode  Code
		wantRetry bool
	}{
		{
			name:      "invalid_config_unknown_backend",
			err:       errors.New("exit status 1"),
			stderr:    "Failed to create file system for \"remote:\": unknown backend \"wat\"",
			wantCode:  CodeInvalidConfig,
			wantRetry: false,
		},
		{
			name:      "signature_mismatch",
			err:       errors.New("exit status 1"),
			stderr:    "SignatureDoesNotMatch: The request signature we calculated does not match the signature you provided",
			wantCode:  CodeSignatureMismatch,
			wantRetry: false,
		},
		{
			name:      "invalid_credentials",
			err:       errors.New("exit status 1"),
			stderr:    "InvalidAccessKeyId: The AWS Access Key Id you provided does not exist in our records.",
			wantCode:  CodeInvalidCredentials,
			wantRetry: false,
		},
		{
			name:      "access_denied",
			err:       errors.New("exit status 1"),
			stderr:    "AccessDenied: Access Denied.",
			wantCode:  CodeAccessDenied,
			wantRetry: false,
		},
		{
			name:      "not_found_bucket",
			err:       errors.New("exit status 1"),
			stderr:    "NoSuchBucket: The specified bucket does not exist",
			wantCode:  CodeNotFound,
			wantRetry: false,
		},
		{
			name:      "request_time_skewed",
			err:       errors.New("exit status 1"),
			stderr:    "RequestTimeTooSkewed: The difference between the request time and the server's time is too large.",
			wantCode:  CodeRequestTimeSkewed,
			wantRetry: false,
		},
		{
			name:      "rate_limited",
			err:       errors.New("exit status 1"),
			stderr:    "TooManyRequests: rate limit exceeded (status 429)",
			wantCode:  CodeRateLimited,
			wantRetry: true,
		},
		{
			name:      "conflict_409",
			err:       errors.New("exit status 1"),
			stderr:    "status 409 Conflict: bucket already exists",
			wantCode:  CodeConflict,
			wantRetry: false,
		},
		{
			name:      "timeout",
			err:       errors.New("exit status 1"),
			stderr:    "context deadline exceeded (Client.Timeout exceeded while awaiting headers)",
			wantCode:  CodeUpstreamTimeout,
			wantRetry: true,
		},
		{
			name:      "endpoint_unreachable_dns",
			err:       errors.New("exit status 1"),
			stderr:    "dial tcp: lookup minio: no such host",
			wantCode:  CodeEndpointUnreachable,
			wantRetry: true,
		},
		{
			name:      "network_error_unexpected_eof",
			err:       errors.New("exit status 1"),
			stderr:    "unexpected EOF",
			wantCode:  CodeNetworkError,
			wantRetry: true,
		},
		{
			name:      "canceled",
			err:       context.Canceled,
			stderr:    "",
			wantCode:  CodeCanceled,
			wantRetry: false,
		},

		{
			name:      "bucket_not_empty_conflict",
			err:       errors.New("exit status 1"),
			stderr:    "BucketNotEmpty: The bucket you tried to delete is not empty",
			wantCode:  CodeConflict,
			wantRetry: false,
		},
		{
			name:      "azure_authorization_failure_access_denied",
			err:       errors.New("exit status 1"),
			stderr:    "AuthorizationFailure: This request is not authorized to perform this operation.",
			wantCode:  CodeAccessDenied,
			wantRetry: false,
		},
		{
			name:      "gcs_does_not_have_access",
			err:       errors.New("exit status 1"),
			stderr:    "googleapi: Error 403: user does not have storage.objects.list access to the Google Cloud Storage bucket.",
			wantCode:  CodeAccessDenied,
			wantRetry: false,
		},
		{
			name:      "oci_not_authenticated_invalid_credentials",
			err:       errors.New("exit status 1"),
			stderr:    "NotAuthenticated: The required information to complete authentication was not provided.",
			wantCode:  CodeInvalidCredentials,
			wantRetry: false,
		},
		{
			name:      "invalid_config_bad_configuration",
			err:       errors.New("exit status 1"),
			stderr:    "bad configuration: missing required field",
			wantCode:  CodeInvalidConfig,
			wantRetry: false,
		},

		{
			name:      "unknown",
			err:       errors.New("exit status 1"),
			stderr:    "some random backend error",
			wantCode:  CodeUnknown,
			wantRetry: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cls := Classify(tc.err, tc.stderr)
			if cls.Code != tc.wantCode {
				t.Fatalf("Code=%q want %q (stderr=%q)", cls.Code, tc.wantCode, tc.stderr)
			}
			if cls.Retryable != tc.wantRetry {
				t.Fatalf("Retryable=%v want %v (code=%q)", cls.Retryable, tc.wantRetry, cls.Code)
			}
		})
	}
}

func TestGoldenStderrSamples(t *testing.T) {
	dir := filepath.Join("testdata")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("failed to read testdata: %v", err)
	}
	if len(entries) == 0 {
		t.Fatalf("no golden stderr samples found in %s", dir)
	}

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".txt") {
			continue
		}

		parts := strings.SplitN(name, "__", 2)
		if len(parts) != 2 {
			t.Fatalf("invalid golden filename (expected <code>__<name>.txt): %s", name)
		}
		wantCode := parts[0]

		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("failed to read %s: %v", name, err)
		}

		cls := Classify(errors.New("exit status 1"), string(b))
		if string(cls.Code) != wantCode {
			t.Errorf("%s: Code=%q want %q", name, cls.Code, wantCode)
		}
	}
}

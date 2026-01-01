package jobs

import "testing"

func TestClassifyRcloneError(t *testing.T) {
	cases := []struct {
		name    string
		message string
		want    string
	}{
		{name: "rate limited", message: "429 Too Many Requests", want: ErrorCodeRateLimited},
		{name: "throttled", message: "Request throttled: slow down", want: ErrorCodeRateLimited},
		{name: "conflict", message: "Object already exists (409 conflict)", want: ErrorCodeConflict},
		{name: "precondition failed", message: "Precondition Failed", want: ErrorCodeConflict},
		{name: "network error", message: "write tcp: broken pipe", want: ErrorCodeNetworkError},
		{name: "unexpected eof", message: "unexpected EOF", want: ErrorCodeNetworkError},
		{name: "not found", message: "NoSuchKey: The specified key does not exist", want: ErrorCodeNotFound},
		{name: "access denied", message: "AccessDenied: Access denied", want: ErrorCodeAccessDenied},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code := classifyRcloneError(nil, tc.message)
			if code != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, code)
			}
		})
	}
}

func TestFormatJobErrorMessage(t *testing.T) {
	msg := FormatJobErrorMessage("something failed", ErrorCodeUnknown)
	if msg != "[unknown] something failed" {
		t.Fatalf("unexpected formatted message: %q", msg)
	}
	already := FormatJobErrorMessage("[unknown] something failed", ErrorCodeUnknown)
	if already != "[unknown] something failed" {
		t.Fatalf("unexpected formatted message (already formatted): %q", already)
	}
}

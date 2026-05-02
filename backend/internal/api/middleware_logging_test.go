package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"s3desk/internal/logging"
)

func TestBuildRequestLogResult_DefaultStatusAndFields(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.RemoteAddr = "10.1.2.3:1234"
	req.Header.Set("X-Profile-Id", "profile-1")
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
	req.Header.Set("User-Agent", "middleware-test")

	status, _, _, _, fields := buildRequestLogResult(req, 0, 321, 1500*time.Millisecond)
	if status != http.StatusOK {
		t.Fatalf("status=%d, want %d", status, http.StatusOK)
	}
	if fields["path"] != "/api/v1/meta" {
		t.Fatalf("path=%v, want %q", fields["path"], "/api/v1/meta")
	}
	if fields["bytes"] != 321 {
		t.Fatalf("bytes=%v, want %d", fields["bytes"], 321)
	}
	if fields["remote_addr"] != "203.0.113.5" {
		t.Fatalf("remote_addr=%v, want %q", fields["remote_addr"], "203.0.113.5")
	}
	if fields["profile_id"] != "profile-1" {
		t.Fatalf("profile_id=%v, want %q", fields["profile_id"], "profile-1")
	}
}

func TestBuildRequestLogResult_AnnotatesBlockedQueryAPIToken(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta?apiToken=demo-token", nil)

	_, _, _, _, fields := buildRequestLogResult(req, http.StatusBadRequest, 0, time.Millisecond)
	if fields["apiToken_source"] != "query_blocked" {
		t.Fatalf("apiToken_source=%v, want query_blocked", fields["apiToken_source"])
	}
}

func captureRequestLogOutput(t *testing.T, fn func()) string {
	t.Helper()

	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	oldStderr := os.Stderr
	os.Stderr = writer
	logging.SetDefault(logging.New(logging.FormatText))
	defer func() {
		os.Stderr = oldStderr
		logging.SetDefault(logging.New(logging.FormatText))
	}()

	fn()
	_ = writer.Close()
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	_ = reader.Close()
	return string(body)
}

func TestWriteRequestLog_LogsWarningForClientError(t *testing.T) {
	output := captureRequestLogOutput(t, func() {
		writeRequestLog(http.StatusBadRequest, "/api/v1/meta", map[string]any{"status": http.StatusBadRequest})
	})
	if !strings.Contains(output, "[WARN] http request warning") {
		t.Fatalf("output=%q, want warning log", output)
	}
}

func TestWriteRequestLog_SkipsHealthEndpoint(t *testing.T) {
	output := captureRequestLogOutput(t, func() {
		writeRequestLog(http.StatusOK, "/healthz", nil)
	})
	if output != "" {
		t.Fatalf("output=%q, want empty", output)
	}
}

package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
)

func TestParseJobLogReadOptions_ClampsAndParses(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-1/logs?tailBytes=0&afterOffset=42&maxBytes=9999999", nil)

	got, err := parseJobLogReadOptions(req)
	if err != nil {
		t.Fatalf("parseJobLogReadOptions error = %v", err)
	}
	if got.tailBytes != 1 {
		t.Fatalf("got.tailBytes=%d, want 1", got.tailBytes)
	}
	if got.afterOffset == nil || *got.afterOffset != 42 {
		t.Fatalf("got.afterOffset=%v, want 42", got.afterOffset)
	}
	if got.maxBytes != maxJobLogReadBytes {
		t.Fatalf("got.maxBytes=%d, want %d", got.maxBytes, maxJobLogReadBytes)
	}
}

func TestParseJobLogReadOptions_InvalidAfterOffset(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-1/logs?afterOffset=-1", nil)

	_, err := parseJobLogReadOptions(req)
	if err == nil {
		t.Fatal("expected error")
	}
	var readErr *jobReadError
	if !errors.As(err, &readErr) {
		t.Fatalf("err=%v, want jobReadError", err)
	}
	if readErr.status != http.StatusBadRequest {
		t.Fatalf("readErr.status=%d, want %d", readErr.status, http.StatusBadRequest)
	}
}

func TestParseJobLogReadOptions_InvalidTailBytes(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-1/logs?tailBytes=abc", nil)

	_, err := parseJobLogReadOptions(req)
	if err == nil {
		t.Fatal("expected error")
	}
	var readErr *jobReadError
	if !errors.As(err, &readErr) {
		t.Fatalf("err=%v, want jobReadError", err)
	}
	if got := readErr.details["tailBytes"]; got != "abc" {
		t.Fatalf("details.tailBytes=%v, want abc", got)
	}
}

func TestParseJobLogReadOptions_InvalidMaxBytes(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-1/logs?afterOffset=1&maxBytes=abc", nil)

	_, err := parseJobLogReadOptions(req)
	if err == nil {
		t.Fatal("expected error")
	}
	var readErr *jobReadError
	if !errors.As(err, &readErr) {
		t.Fatalf("err=%v, want jobReadError", err)
	}
	if got := readErr.details["maxBytes"]; got != "abc" {
		t.Fatalf("details.maxBytes=%v, want abc", got)
	}
}

func TestBuildJobArtifactReadResult_ReturnsPreparedContent(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	artifactDir := filepath.Join(dataDir, "artifacts", "jobs")
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir artifact dir: %v", err)
	}
	wantBody := []byte("zip-body")
	if err := os.WriteFile(filepath.Join(artifactDir, "job-1.zip"), wantBody, 0o600); err != nil {
		t.Fatalf("write artifact: %v", err)
	}

	filename, _, _, file, err := buildJobArtifactReadResult(dataDir, jobRequest{
		jobID: "job-1",
		job: models.Job{
			ID:     "job-1",
			Type:   jobs.JobTypeS3ZipPrefix,
			Status: models.JobStatusSucceeded,
			Payload: map[string]any{
				"bucket": "test-bucket",
				"prefix": "reports/",
			},
		},
	})
	if err != nil {
		t.Fatalf("buildJobArtifactReadResult error = %v", err)
	}
	defer func() { _ = file.Close() }()

	if filename != "test-bucket-reports.zip" {
		t.Fatalf("filename=%q, want test-bucket-reports.zip", filename)
	}
	body, err := io.ReadAll(file)
	if err != nil {
		t.Fatalf("read artifact file: %v", err)
	}
	if !bytes.Equal(body, wantBody) {
		t.Fatalf("unexpected artifact body %q", string(body))
	}
}

func TestBuildJobLogReadResultRejectsUnsafeJobID(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	outsideLogPath := filepath.Join(dataDir, "logs", "escape.log")
	if err := os.MkdirAll(filepath.Dir(outsideLogPath), 0o755); err != nil {
		t.Fatalf("mkdir outside log dir: %v", err)
	}
	if err := os.WriteFile(outsideLogPath, []byte("sentinel"), 0o600); err != nil {
		t.Fatalf("write outside log: %v", err)
	}

	_, _, err := buildJobLogReadResult(dataDir, "../escape", jobLogReadOptions{
		tailBytes: defaultJobLogReadBytes,
		maxBytes:  defaultJobLogReadBytes,
	})
	if err == nil {
		t.Fatal("expected unsafe job id to fail")
	}
	var readErr *jobReadError
	if !errors.As(err, &readErr) {
		t.Fatalf("err=%v, want jobReadError", err)
	}
	if readErr.status != http.StatusBadRequest {
		t.Fatalf("readErr.status=%d, want %d", readErr.status, http.StatusBadRequest)
	}
	if got, err := os.ReadFile(outsideLogPath); err != nil || string(got) != "sentinel" {
		t.Fatalf("outside log changed or unreadable: body=%q err=%v", string(got), err)
	}
}

func TestBuildJobLogReadResult_AdjustsAfterOffsetPastEnd(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	logDir := filepath.Join(dataDir, "logs", "jobs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatalf("mkdir log dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(logDir, "job-1.log"), []byte("abcdef"), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}

	afterOffset := int64(99)
	body, nextOffset, err := buildJobLogReadResult(dataDir, "job-1", jobLogReadOptions{
		tailBytes:   defaultJobLogReadBytes,
		maxBytes:    3,
		afterOffset: &afterOffset,
	})
	if err != nil {
		t.Fatalf("buildJobLogReadResult error = %v", err)
	}
	if string(body) != "def" {
		t.Fatalf("body=%q, want def", string(body))
	}
	if nextOffset != 6 {
		t.Fatalf("nextOffset=%d, want 6", nextOffset)
	}
}

func TestJobReadHTTPService_ExecuteGet_ReturnsLoadedJob(t *testing.T) {
	t.Parallel()

	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	job := createStoredJob(t, st, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
		"bucket": "test-bucket",
		"keys":   []any{"a.txt"},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/"+job.ID, nil)
	req.Header.Set("X-Profile-Id", profile.ID)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("jobId", job.ID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	result, err := newJobReadHTTPService(&server{store: st}).executeGet(req)
	if err != nil {
		t.Fatalf("executeGet error = %v", err)
	}
	if result == nil {
		t.Fatal("expected job result")
	}
	if result.ID != job.ID {
		t.Fatalf("result.ID=%q, want %q", result.ID, job.ID)
	}
}

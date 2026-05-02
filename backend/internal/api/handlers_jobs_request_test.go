package api

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
)

func TestExtractJobRequest_ReturnsPreparedInput(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs/job-1/cancel", nil)
	req.Header.Set("X-Profile-Id", "profile-1")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("jobId", "job-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	got := extractJobRequest(req)
	if got.err != nil {
		t.Fatalf("extractJobRequest error = %v", got.err)
	}
	if got.profileID != "profile-1" {
		t.Fatalf("got.profileID=%q, want profile-1", got.profileID)
	}
	if got.jobID != "job-1" {
		t.Fatalf("got.jobID=%q, want job-1", got.jobID)
	}
}

func TestServerPrepareJobRequest_ReturnsNotFoundError(t *testing.T) {
	t.Parallel()

	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	srv := &server{store: st}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/jobs/missing", nil)
	req.Header.Set("X-Profile-Id", profile.ID)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("jobId", "missing")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	_, err := srv.prepareJobRequest(context.Background(), req)
	if err == nil {
		t.Fatal("expected error")
	}
	var prepErr *jobRequestPreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%v, want jobRequestPreparationError", err)
	}
	if prepErr.status != http.StatusNotFound {
		t.Fatalf("prepErr.status=%d, want %d", prepErr.status, http.StatusNotFound)
	}
	if prepErr.code != "not_found" {
		t.Fatalf("prepErr.code=%q, want not_found", prepErr.code)
	}
}

func TestJobDeleteCompletedRemovesPersistedArtifacts(t *testing.T) {
	t.Parallel()

	st, _, srv, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	job := createJob(t, srv, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
		"bucket": "test-bucket",
		"keys":   []any{"a.txt"},
	})

	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(context.Background(), job.ID, models.JobStatusSucceeded, nil, &finishedAt, nil, nil, nil); err != nil {
		t.Fatalf("mark succeeded: %v", err)
	}

	logDir := filepath.Join(dataDir, "logs", "jobs")
	artifactDir := filepath.Join(dataDir, "artifacts", "jobs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatalf("mkdir log dir: %v", err)
	}
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir artifact dir: %v", err)
	}
	for _, path := range []string{
		filepath.Join(logDir, job.ID+".log"),
		filepath.Join(logDir, job.ID+".cmd"),
		filepath.Join(artifactDir, job.ID+".zip"),
		filepath.Join(artifactDir, job.ID+".zip.tmp"),
	} {
		if err := os.WriteFile(path, []byte("test"), 0o600); err != nil {
			t.Fatalf("write fixture %s: %v", path, err)
		}
	}

	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/jobs/"+job.ID, profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 204, got %d: %s", res.StatusCode, string(body))
	}

	_, ok, err := st.GetJob(context.Background(), profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get deleted job: %v", err)
	}
	if ok {
		t.Fatal("expected deleted job to be absent")
	}

	for _, path := range []string{
		filepath.Join(logDir, job.ID+".log"),
		filepath.Join(logDir, job.ID+".cmd"),
		filepath.Join(artifactDir, job.ID+".zip"),
		filepath.Join(artifactDir, job.ID+".zip.tmp"),
	} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be removed, err=%v", path, err)
		}
	}
}

func TestJobDeleteRejectsActiveStatus(t *testing.T) {
	t.Parallel()

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	job := createJob(t, srv, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
		"bucket": "test-bucket",
		"keys":   []any{"a.txt"},
	})

	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/jobs/"+job.ID, profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 409, got %d: %s", res.StatusCode, string(body))
	}

	updated := getJob(t, srv, profile.ID, job.ID)
	if updated.Status != models.JobStatusQueued {
		t.Fatalf("expected job to remain queued, got %s", updated.Status)
	}
}

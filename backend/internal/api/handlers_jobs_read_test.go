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
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/ws"
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

func TestJobReadsRemainAvailableWhenProviderConfigIsBlocked(t *testing.T) {
	t.Parallel()

	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	otherProfile := createTestProfile(t, st)
	job := createStoredJob(t, st, profile.ID, jobs.JobTypeS3ZipPrefix, map[string]any{
		"bucket": "test-bucket",
		"prefix": "reports/",
	})
	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(context.Background(), job.ID, models.JobStatusSucceeded, nil, &finishedAt, nil, nil, nil); err != nil {
		t.Fatalf("mark job succeeded: %v", err)
	}

	logDir := filepath.Join(dataDir, "logs", "jobs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatalf("mkdir log dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(logDir, job.ID+".log"), []byte("diagnostic log"), 0o600); err != nil {
		t.Fatalf("write job log: %v", err)
	}
	artifactDir := filepath.Join(dataDir, "artifacts", "jobs")
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir artifact dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactDir, job.ID+".zip"), []byte("zip payload"), 0o600); err != nil {
		t.Fatalf("write job artifact: %v", err)
	}

	srv := httptest.NewServer(New(Dependencies{
		Config: config.Config{
			DataDir:     dataDir,
			StaticDir:   dataDir,
			AllowRemote: true,
		},
		Store: st,
		Jobs:  manager,
		Hub:   ws.NewHub(),
	}))
	t.Cleanup(srv.Close)

	for _, tc := range []struct {
		name        string
		path        string
		profileID   string
		wantStatus  int
		wantErrCode string
	}{
		{name: "missing profile list", path: "/api/v1/jobs", wantStatus: http.StatusBadRequest, wantErrCode: "missing_profile"},
		{name: "unknown profile before invalid filter", path: "/api/v1/jobs?limit=oops", profileID: "missing", wantStatus: http.StatusBadRequest, wantErrCode: "profile_not_found"},
		{name: "invalid filter for stored profile", path: "/api/v1/jobs?limit=oops", profileID: profile.ID, wantStatus: http.StatusBadRequest, wantErrCode: "invalid_request"},
		{name: "other profile job", path: "/api/v1/jobs/" + job.ID, profileID: otherProfile.ID, wantStatus: http.StatusNotFound, wantErrCode: "not_found"},
		{name: "other profile artifact", path: "/api/v1/jobs/" + job.ID + "/artifact", profileID: otherProfile.ID, wantStatus: http.StatusNotFound, wantErrCode: "not_found"},
		{name: "missing profile log", path: "/api/v1/jobs/" + job.ID + "/logs", wantStatus: http.StatusBadRequest, wantErrCode: "missing_profile"},
		{name: "unknown profile log", path: "/api/v1/jobs/" + job.ID + "/logs", profileID: "missing", wantStatus: http.StatusBadRequest, wantErrCode: "profile_not_found"},
		{name: "other profile log", path: "/api/v1/jobs/" + job.ID + "/logs", profileID: otherProfile.ID, wantStatus: http.StatusNotFound, wantErrCode: "not_found"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := doJSONRequestWithProfile(t, srv, http.MethodGet, tc.path, tc.profileID, nil)
			defer res.Body.Close()
			if res.StatusCode != tc.wantStatus {
				body, _ := io.ReadAll(res.Body)
				t.Fatalf("status=%d, want %d: %s", res.StatusCode, tc.wantStatus, string(body))
			}
			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != tc.wantErrCode {
				t.Fatalf("error.code=%q, want %q", errResp.Error.Code, tc.wantErrCode)
			}
		})
	}

	logRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+job.ID+"/logs", profile.ID, nil)
	defer logRes.Body.Close()
	if logRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(logRes.Body)
		t.Fatalf("log status=%d, want %d: %s", logRes.StatusCode, http.StatusOK, string(body))
	}
	if body, err := io.ReadAll(logRes.Body); err != nil || string(body) != "diagnostic log" {
		t.Fatalf("log body=%q err=%v, want diagnostic log", string(body), err)
	}

	listRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs", profile.ID, nil)
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listRes.Body)
		t.Fatalf("list status=%d, want %d: %s", listRes.StatusCode, http.StatusOK, string(body))
	}
	var listed models.JobsListResponse
	decodeJSONResponse(t, listRes, &listed)
	if len(listed.Items) != 1 || listed.Items[0].ID != job.ID {
		t.Fatalf("listed jobs=%+v, want job %q", listed.Items, job.ID)
	}

	jobRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+job.ID, profile.ID, nil)
	defer jobRes.Body.Close()
	if jobRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(jobRes.Body)
		t.Fatalf("job status=%d, want %d: %s", jobRes.StatusCode, http.StatusOK, string(body))
	}
	var gotJob models.Job
	decodeJSONResponse(t, jobRes, &gotJob)
	if gotJob.ID != job.ID {
		t.Fatalf("job id=%q, want %q", gotJob.ID, job.ID)
	}

	artifactRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+job.ID+"/artifact", profile.ID, nil)
	defer artifactRes.Body.Close()
	if artifactRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(artifactRes.Body)
		t.Fatalf("artifact status=%d, want %d: %s", artifactRes.StatusCode, http.StatusOK, string(body))
	}
	if body, err := io.ReadAll(artifactRes.Body); err != nil || string(body) != "zip payload" {
		t.Fatalf("artifact body=%q err=%v, want zip payload", string(body), err)
	}

	mutationRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/jobs/"+job.ID+"/cancel", profile.ID, nil)
	defer mutationRes.Body.Close()
	if mutationRes.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(mutationRes.Body)
		t.Fatalf("mutation status=%d, want %d: %s", mutationRes.StatusCode, http.StatusBadRequest, string(body))
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, mutationRes, &errResp)
	if errResp.Error.Code != "invalid_config" {
		t.Fatalf("mutation error.code=%q, want invalid_config", errResp.Error.Code)
	}
}

func TestJobReadHTTPService_LogsDoNotRequireDecodingJobPayload(t *testing.T) {
	t.Parallel()

	st, _, srv, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	otherProfile := createTestProfile(t, st)
	job := createStoredJob(t, st, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
		"bucket": "test-bucket",
		"keys":   []any{"a.txt"},
	})

	corruptDB, err := db.Open(db.Config{
		Backend:    db.BackendSQLite,
		SQLitePath: filepath.Join(dataDir, "s3desk.db"),
	})
	if err != nil {
		t.Fatalf("open database for corruption fixture: %v", err)
	}
	corruptSQLDB, err := corruptDB.DB()
	if err != nil {
		t.Fatalf("open sql database for corruption fixture: %v", err)
	}
	if err := corruptDB.Table("jobs").Where("id = ?", job.ID).Updates(map[string]any{
		"payload_json":  "{",
		"progress_json": "{",
	}).Error; err != nil {
		_ = corruptSQLDB.Close()
		t.Fatalf("corrupt job metadata fixture: %v", err)
	}
	if err := corruptSQLDB.Close(); err != nil {
		t.Fatalf("close corruption fixture database: %v", err)
	}

	logDir := filepath.Join(dataDir, "logs", "jobs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatalf("mkdir log dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(logDir, job.ID+".log"), []byte("diagnostic log"), 0o600); err != nil {
		t.Fatalf("write job log: %v", err)
	}
	jobRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+job.ID, profile.ID, nil)
	defer jobRes.Body.Close()
	if jobRes.StatusCode != http.StatusInternalServerError {
		t.Fatalf("job metadata status=%d, want %d", jobRes.StatusCode, http.StatusInternalServerError)
	}
	otherRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+job.ID+"/logs", otherProfile.ID, nil)
	defer otherRes.Body.Close()
	if otherRes.StatusCode != http.StatusNotFound {
		t.Fatalf("other profile log status=%d, want %d", otherRes.StatusCode, http.StatusNotFound)
	}

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+job.ID+"/logs", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d: %s", res.StatusCode, http.StatusOK, string(body))
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read job log response: %v", err)
	}
	if string(body) != "diagnostic log" {
		t.Fatalf("body=%q, want diagnostic log", string(body))
	}
}

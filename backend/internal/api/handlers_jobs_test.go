package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestJobLogsTailAndOffsets(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone uses a shell script")
	}

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), true)
	profile := createTestProfile(t, st)
	localDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(localDir, "sample.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatalf("write sample file: %v", err)
	}

	rclonePath := writeFakeRclone(t, "printf 'hello from rclone\\n'\n")
	t.Setenv("RCLONE_PATH", rclonePath)

	job := createJob(t, srv, profile.ID, jobs.JobTypeTransferSyncLocalToS3, map[string]any{
		"bucket":    "test-bucket",
		"prefix":    "path/",
		"localPath": localDir,
	})

	_ = waitForJobStatus(t, srv, profile.ID, job.ID, models.JobStatusSucceeded, 5*time.Second)

	logRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+job.ID+"/logs", profile.ID, nil)
	defer logRes.Body.Close()
	if logRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", logRes.StatusCode)
	}
	logBody, err := io.ReadAll(logRes.Body)
	if err != nil {
		t.Fatalf("read log body: %v", err)
	}
	if !bytes.Contains(logBody, []byte("hello from rclone")) {
		t.Fatalf("expected log output to contain rclone message, got %q", string(logBody))
	}

	offsetHeader := logRes.Header.Get("X-Log-Next-Offset")
	if offsetHeader == "" {
		t.Fatalf("expected X-Log-Next-Offset header")
	}
	offset, err := strconv.ParseInt(offsetHeader, 10, 64)
	if err != nil || offset <= 0 {
		t.Fatalf("expected valid X-Log-Next-Offset, got %q", offsetHeader)
	}

	afterRes := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodGet,
		"/api/v1/jobs/"+job.ID+"/logs?afterOffset="+offsetHeader,
		profile.ID,
		nil,
	)
	defer afterRes.Body.Close()
	if afterRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", afterRes.StatusCode)
	}
	afterBody, err := io.ReadAll(afterRes.Body)
	if err != nil {
		t.Fatalf("read afterOffset body: %v", err)
	}
	if len(afterBody) != 0 {
		t.Fatalf("expected empty log tail after offset, got %q", string(afterBody))
	}
	if afterRes.Header.Get("X-Log-Next-Offset") != offsetHeader {
		t.Fatalf("expected next offset %q, got %q", offsetHeader, afterRes.Header.Get("X-Log-Next-Offset"))
	}
}

func TestJobCancelLifecycle(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone uses a shell script")
	}

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), true)
	profile := createTestProfile(t, st)
	localDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(localDir, "sample.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatalf("write sample file: %v", err)
	}

	rclonePath := writeFakeRclone(t, "printf 'starting\\n'\nsleep 10\n")
	t.Setenv("RCLONE_PATH", rclonePath)

	job := createJob(t, srv, profile.ID, jobs.JobTypeTransferSyncLocalToS3, map[string]any{
		"bucket":    "test-bucket",
		"prefix":    "path/",
		"localPath": localDir,
	})

	_ = waitForJobStatus(t, srv, profile.ID, job.ID, models.JobStatusRunning, 5*time.Second)

	cancelRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/jobs/"+job.ID+"/cancel", profile.ID, nil)
	defer cancelRes.Body.Close()
	if cancelRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", cancelRes.StatusCode)
	}

	_ = waitForJobStatus(t, srv, profile.ID, job.ID, models.JobStatusCanceled, 5*time.Second)
	updated := getJob(t, srv, profile.ID, job.ID)
	if updated.ErrorCode == nil || *updated.ErrorCode != jobs.ErrorCodeCanceled {
		t.Fatalf("expected error code %q, got %v", jobs.ErrorCodeCanceled, updated.ErrorCode)
	}
}

func TestJobCancelQueued(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	job := createJob(t, srv, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
		"bucket": "test-bucket",
		"keys":   []any{"a.txt"},
	})

	cancelRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/jobs/"+job.ID+"/cancel", profile.ID, nil)
	defer cancelRes.Body.Close()
	if cancelRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", cancelRes.StatusCode)
	}

	updated := getJob(t, srv, profile.ID, job.ID)
	if updated.Status != models.JobStatusCanceled {
		t.Fatalf("expected canceled status, got %s", updated.Status)
	}
	if updated.ErrorCode == nil || *updated.ErrorCode != jobs.ErrorCodeCanceled {
		t.Fatalf("expected error code %q, got %v", jobs.ErrorCodeCanceled, updated.ErrorCode)
	}
}

func TestJobCancelInvalidStatus(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	ctx := context.Background()
	cases := []struct {
		name   string
		status models.JobStatus
	}{
		{name: "succeeded", status: models.JobStatusSucceeded},
		{name: "failed", status: models.JobStatusFailed},
		{name: "canceled", status: models.JobStatusCanceled},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			job := createJob(t, srv, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
				"bucket": "test-bucket",
				"keys":   []any{"a.txt"},
			})

			finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
			var errMsg *string
			var errorCode *string
			if tc.status == models.JobStatusFailed {
				msg := "failed"
				code := jobs.ErrorCodeUnknown
				errMsg = &msg
				errorCode = &code
			}
			if tc.status == models.JobStatusCanceled {
				code := jobs.ErrorCodeCanceled
				errorCode = &code
			}

			if err := st.UpdateJobStatus(ctx, job.ID, tc.status, nil, &finishedAt, nil, errMsg, errorCode); err != nil {
				t.Fatalf("update job: %v", err)
			}

			cancelRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/jobs/"+job.ID+"/cancel", profile.ID, nil)
			defer cancelRes.Body.Close()
			if cancelRes.StatusCode != http.StatusBadRequest {
				body, _ := io.ReadAll(cancelRes.Body)
				t.Fatalf("expected status 400, got %d: %s", cancelRes.StatusCode, string(body))
			}

			updated := getJob(t, srv, profile.ID, job.ID)
			if updated.Status != tc.status {
				t.Fatalf("expected status %s, got %s", tc.status, updated.Status)
			}
		})
	}
}

func TestJobRetryLifecycle(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone uses a shell script")
	}

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), true)
	profile := createTestProfile(t, st)
	localDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(localDir, "sample.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatalf("write sample file: %v", err)
	}

	rclonePath := writeFakeRclone(t, "printf 'fail\\n'\nexit 1\n")
	t.Setenv("RCLONE_PATH", rclonePath)

	job := createJob(t, srv, profile.ID, jobs.JobTypeTransferSyncLocalToS3, map[string]any{
		"bucket":    "test-bucket",
		"prefix":    "path/",
		"localPath": localDir,
	})

	_ = waitForJobStatus(t, srv, profile.ID, job.ID, models.JobStatusFailed, 5*time.Second)

	retryRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/jobs/"+job.ID+"/retry", profile.ID, nil)
	defer retryRes.Body.Close()
	if retryRes.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(retryRes.Body)
		t.Fatalf("expected status 201, got %d: %s", retryRes.StatusCode, string(body))
	}

	var retryJob models.Job
	decodeJSONResponse(t, retryRes, &retryJob)
	if retryJob.ID == job.ID {
		t.Fatalf("expected a new job id, got %s", retryJob.ID)
	}
	if retryJob.Status != models.JobStatusQueued {
		t.Fatalf("expected queued status, got %s", retryJob.Status)
	}
}

func TestJobRetryInvalidStatus(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	ctx := context.Background()
	cases := []struct {
		name      string
		status    models.JobStatus
		startedAt *string
		finished  *string
	}{
		{name: "queued", status: models.JobStatusQueued},
		{name: "running", status: models.JobStatusRunning, startedAt: ptrString(time.Now().UTC().Format(time.RFC3339Nano))},
		{name: "succeeded", status: models.JobStatusSucceeded, finished: ptrString(time.Now().UTC().Format(time.RFC3339Nano))},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			job := createJob(t, srv, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
				"bucket": "test-bucket",
				"keys":   []any{"a.txt"},
			})

			if tc.status != models.JobStatusQueued {
				if err := st.UpdateJobStatus(ctx, job.ID, tc.status, tc.startedAt, tc.finished, nil, nil, nil); err != nil {
					t.Fatalf("update job: %v", err)
				}
			}

			retryRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/jobs/"+job.ID+"/retry", profile.ID, nil)
			defer retryRes.Body.Close()
			if retryRes.StatusCode != http.StatusBadRequest {
				body, _ := io.ReadAll(retryRes.Body)
				t.Fatalf("expected status 400, got %d: %s", retryRes.StatusCode, string(body))
			}
		})
	}
}

func newTestJobsServer(t *testing.T, encryptionKey string, startManager bool) (*store.Store, *jobs.Manager, *httptest.Server, string) {
	t.Helper()
	dataDir := t.TempDir()
	gormDB, err := db.Open(db.Config{
		Backend:    db.BackendSQLite,
		SQLitePath: filepath.Join(dataDir, "s3desk.db"),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("open sql db: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	st, err := store.New(gormDB, store.Options{
		EncryptionKey: encryptionKey,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	hub := ws.NewHub()
	manager := jobs.NewManager(jobs.Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              hub,
		Concurrency:      1,
		JobLogMaxBytes:   0,
		JobRetention:     0,
		AllowedLocalDirs: nil,
		UploadSessionTTL: time.Minute,
	})

	handler := New(Dependencies{
		Config: config.Config{
			Addr:             "127.0.0.1:0",
			DataDir:          dataDir,
			DBBackend:        string(db.BackendSQLite),
			StaticDir:        dataDir,
			EncryptionKey:    encryptionKey,
			JobConcurrency:   1,
			UploadSessionTTL: time.Minute,
		},
		Store:      st,
		Jobs:       manager,
		Hub:        hub,
		ServerAddr: "127.0.0.1:0",
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	if startManager {
		ctx, cancel := context.WithCancel(context.Background())
		t.Cleanup(cancel)
		go manager.Run(ctx)
	}

	return st, manager, srv, dataDir
}

func writeFakeRclone(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "rclone")
	content := "#!/bin/sh\n" +
		"if [ \"$1\" = \"version\" ]; then\n" +
		"  echo \"rclone v1.66.0\"\n" +
		"  exit 0\n" +
		"fi\n" +
		body
	if err := os.WriteFile(path, []byte(content), 0o700); err != nil {
		t.Fatalf("write fake rclone: %v", err)
	}
	return path
}

func createJob(t *testing.T, srv *httptest.Server, profileID, jobType string, payload map[string]any) models.Job {
	t.Helper()
	req := models.JobCreateRequest{
		Type:    jobType,
		Payload: payload,
	}
	res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/jobs", profileID, req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 201, got %d: %s", res.StatusCode, string(body))
	}
	var job models.Job
	decodeJSONResponse(t, res, &job)
	return job
}

func waitForJobStatus(t *testing.T, srv *httptest.Server, profileID, jobID string, want models.JobStatus, timeout time.Duration) models.Job {
	t.Helper()
	deadline := time.Now().Add(timeout)
	var last models.Job
	for time.Now().Before(deadline) {
		last = getJob(t, srv, profileID, jobID)
		if last.Status == want {
			return last
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("job %s did not reach status %s (last=%s)", jobID, want, last.Status)
	return last
}

func getJob(t *testing.T, srv *httptest.Server, profileID, jobID string) models.Job {
	t.Helper()
	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/jobs/"+jobID, profileID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	var job models.Job
	decodeJSONResponse(t, res, &job)
	return job
}

func ptrString(value string) *string {
	return &value
}

func doJSONRequestWithProfile(t *testing.T, srv *httptest.Server, method, path, profileID string, payload any) *http.Response {
	t.Helper()
	var body *bytes.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(data)
	} else {
		body = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, srv.URL+path, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("X-Profile-Id", profileID)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return res
}

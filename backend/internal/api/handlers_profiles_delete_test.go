package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/config"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestProfileDeleteHTTPService_PrepareDeleteProfile_RequiresProfileID(t *testing.T) {
	t.Parallel()

	prepared := newProfileDeleteHTTPService(&server{}).prepareDeleteProfile(
		httptest.NewRequest(http.MethodDelete, "/api/v1/profiles", nil),
	)
	if prepared.err == nil {
		t.Fatal("expected error")
	}
}

func TestExecutePreparedProfileDelete_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newProfileDeleteHTTPService(&server{})

	err := svc.executePrepared(context.Background(), profileDeletePreparedRequest{
		profileID: "profile-1",
		err:       newProfileDeletePreparationError(http.StatusBadRequest, "invalid_request", "bad request", nil),
	})
	if err == nil {
		t.Fatal("expected error")
	}
	var prepErr *profileDeletePreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%T, want profileDeletePreparationError", err)
	}
	if prepErr.code != "invalid_request" {
		t.Fatalf("prepErr.code=%q, want invalid_request", prepErr.code)
	}
}

func TestExecutePreparedProfileDelete_UsesPreparedExecution(t *testing.T) {
	t.Parallel()

	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	svc := newProfileDeleteHTTPService(&server{
		store: st,
		jobs:  manager,
		cfg:   config.Config{DataDir: dataDir},
	})
	err := svc.executePrepared(context.Background(), profileDeletePreparedRequest{profileID: profile.ID})
	if err != nil {
		t.Fatalf("err=%v, want nil", err)
	}
	if _, ok, err := st.GetProfile(context.Background(), profile.ID); err != nil || ok {
		t.Fatalf("GetProfile() = (_, %v, %v), want deleted", ok, err)
	}
}

func TestExecuteDelete_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newProfileDeleteHTTPService(&server{})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/profile-1", nil)

	err := svc.executeDelete(req)
	if err == nil {
		t.Fatal("expected error")
	}
	var prepErr *profileDeletePreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%T, want profileDeletePreparationError", err)
	}
	if prepErr.code != "invalid_request" {
		t.Fatalf("prepErr.code=%q, want invalid_request", prepErr.code)
	}
}

func TestProfileDeleteHTTPService_HandleDeleteProfile_RemovesArtifactsAndProfile(t *testing.T) {
	t.Parallel()

	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type:    jobs.JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "demo", "keys": []any{"a.txt"}},
	})
	if err != nil {
		t.Fatalf("CreateJob: %v", err)
	}
	logPath := filepath.Join(dataDir, "logs", "jobs", job.ID+".log")
	artifactPaths := []string{
		logPath,
		filepath.Join(dataDir, "logs", "jobs", job.ID+".cmd"),
		filepath.Join(dataDir, "artifacts", "jobs", job.ID+".zip"),
		filepath.Join(dataDir, "artifacts", "jobs", job.ID+".zip.tmp"),
	}
	for _, artifactPath := range artifactPaths {
		if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
			t.Fatalf("mkdir artifact dir: %v", err)
		}
		if err := os.WriteFile(artifactPath, []byte("job artifact"), 0o600); err != nil {
			t.Fatalf("write artifact: %v", err)
		}
	}

	session, err := st.CreateUploadSession(
		context.Background(),
		profile.ID,
		"bucket",
		"prefix",
		"staging",
		"/tmp/staged",
		time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
	)
	if err != nil {
		t.Fatalf("CreateUploadSession: %v", err)
	}
	stagingDir, err := store.ResolveUploadStagingDir(dataDir, session.ID)
	if err != nil {
		t.Fatalf("ResolveUploadStagingDir: %v", err)
	}
	if err := os.MkdirAll(stagingDir, 0o755); err != nil {
		t.Fatalf("mkdir staging dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stagingDir, "chunk.bin"), []byte("chunk"), 0o600); err != nil {
		t.Fatalf("write staging file: %v", err)
	}

	svc := newProfileDeleteHTTPService(&server{
		store: st,
		jobs:  manager,
		cfg:   config.Config{DataDir: dataDir},
	})
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/"+profile.ID, nil), profile.ID)

	svc.handleDeleteProfile(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNoContent)
	}
	for _, artifactPath := range artifactPaths {
		if _, err := os.Stat(artifactPath); !os.IsNotExist(err) {
			t.Fatalf("artifact %q still exists or unexpected stat err: %v", artifactPath, err)
		}
	}
	if _, err := os.Stat(stagingDir); !os.IsNotExist(err) {
		t.Fatalf("stagingDir still exists or unexpected stat err: %v", err)
	}
	if _, ok, err := st.GetProfile(context.Background(), profile.ID); err != nil || ok {
		t.Fatalf("GetProfile() = (_, %v, %v), want deleted", ok, err)
	}
}

func TestProfileDeleteHTTPService_HandleDeleteProfile_DoesNotDeleteActiveJobProfile(t *testing.T) {
	t.Parallel()

	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type:    jobs.JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "demo", "keys": []any{"a.txt"}},
	})
	if err != nil {
		t.Fatalf("CreateJob: %v", err)
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(context.Background(), job.ID, models.JobStatusRunning, &startedAt, nil, nil, nil, nil); err != nil {
		t.Fatalf("UpdateJobStatus: %v", err)
	}

	svc := newProfileDeleteHTTPService(&server{
		store: st,
		jobs:  manager,
		cfg:   config.Config{DataDir: dataDir},
	})
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/"+profile.ID, nil).WithContext(ctx), profile.ID)

	svc.handleDeleteProfile(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusConflict)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "conflict" {
		t.Fatalf("resp.Error.Code=%q, want conflict", resp.Error.Code)
	}
	if _, ok, err := st.GetProfile(context.Background(), profile.ID); err != nil || !ok {
		t.Fatalf("GetProfile() = (_, %v, %v), want profile retained", ok, err)
	}
}

func TestProfileDeleteHTTPService_CleansUploadSessionPages(t *testing.T) {
	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	for i := 0; i < profileDeleteUploadSessionPageSize+1; i++ {
		if _, err := st.CreateUploadSession(
			context.Background(),
			profile.ID,
			"bucket",
			"prefix",
			uploadModeStaging,
			"",
			time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
		); err != nil {
			t.Fatalf("create upload session %d: %v", i, err)
		}
	}

	svc := newProfileDeleteHTTPService(&server{
		store: st,
		jobs:  manager,
		cfg:   config.Config{DataDir: dataDir},
	})
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/"+profile.ID, nil), profile.ID)
	svc.handleDeleteProfile(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNoContent)
	}
	if sessions, err := st.ListUploadSessionsByProfile(context.Background(), profile.ID, 10); err != nil {
		t.Fatalf("list upload sessions: %v", err)
	} else if len(sessions) != 0 {
		t.Fatalf("upload sessions=%d, want 0", len(sessions))
	}
}

func TestProfileDeleteHTTPService_CleansDirectMultipartAndTempState(t *testing.T) {
	var abortedUploadID string
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		abortedUploadID = r.URL.Query().Get("uploadId")
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(fakeS3.Close)

	st, manager, _, dataDir := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	seedMultipartUploadMetadata(t, st, profile.ID, session.ID, "test-bucket", "incoming", "file.bin", "multipart-id", 5, 10)
	var rcloneCalls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		rcloneCalls = append(rcloneCalls, append([]string(nil), args...))
		return "", "", nil
	})

	svc := newProfileDeleteHTTPService(&server{
		store: st,
		jobs:  manager,
		cfg:   config.Config{DataDir: dataDir},
	})
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/"+profile.ID, nil), profile.ID)
	svc.handleDeleteProfile(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNoContent)
	}
	if abortedUploadID != "multipart-id" {
		t.Fatalf("aborted uploadId=%q, want multipart-id", abortedUploadID)
	}
	if len(rcloneCalls) != 1 || len(rcloneCalls[0]) != 2 || rcloneCalls[0][0] != "delete" {
		t.Fatalf("rcloneCalls=%v, want one delete", rcloneCalls)
	}
	wantTarget := "remote:test-bucket/incoming/.s3desk-upload-temp/" + session.ID + "/"
	if rcloneCalls[0][1] != wantTarget {
		t.Fatalf("rclone target=%q, want %q", rcloneCalls[0][1], wantTarget)
	}
	if _, ok, err := st.GetProfile(context.Background(), profile.ID); err != nil || ok {
		t.Fatalf("profile exists=%v err=%v, want deleted", ok, err)
	}
}

func TestProfileDeleteHTTPService_CleansStaleStagingMultipart(t *testing.T) {
	var abortedUploadID string
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		abortedUploadID = r.URL.Query().Get("uploadId")
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(fakeS3.Close)

	st, manager, _, dataDir := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	seedMultipartUploadMetadata(t, st, profile.ID, session.ID, "test-bucket", "incoming", "file.bin", "stale-multipart-id", 5, 10)

	svc := newProfileDeleteHTTPService(&server{
		store: st,
		jobs:  manager,
		cfg:   config.Config{DataDir: dataDir},
	})
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/"+profile.ID, nil), profile.ID)
	svc.handleDeleteProfile(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNoContent)
	}
	if abortedUploadID != "stale-multipart-id" {
		t.Fatalf("aborted uploadId=%q, want stale-multipart-id", abortedUploadID)
	}
	if _, ok, err := st.GetProfile(context.Background(), profile.ID); err != nil || ok {
		t.Fatalf("profile exists=%v err=%v, want deleted", ok, err)
	}
}

func TestProfileDeleteHTTPService_HandleDeleteProfile_ReturnsNotFound(t *testing.T) {
	t.Parallel()

	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	svc := newProfileDeleteHTTPService(&server{
		store: st,
		jobs:  manager,
		cfg:   config.Config{DataDir: dataDir},
	})
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/missing", nil), "missing")

	svc.handleDeleteProfile(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNotFound)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "not_found" {
		t.Fatalf("resp.Error.Code=%q, want not_found", resp.Error.Code)
	}
}

func withProfileIDParam(req *http.Request, profileID string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("profileId", profileID)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

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
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		t.Fatalf("mkdir log dir: %v", err)
	}
	if err := os.WriteFile(logPath, []byte("job log"), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
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
	if _, err := os.Stat(logPath); !os.IsNotExist(err) {
		t.Fatalf("logPath still exists or unexpected stat err: %v", err)
	}
	if _, err := os.Stat(stagingDir); !os.IsNotExist(err) {
		t.Fatalf("stagingDir still exists or unexpected stat err: %v", err)
	}
	if _, ok, err := st.GetProfile(context.Background(), profile.ID); err != nil || ok {
		t.Fatalf("GetProfile() = (_, %v, %v), want deleted", ok, err)
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

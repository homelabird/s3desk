package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestUploadFilesHTTPService_HandleUploadFiles_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/files", bytes.NewBufferString("hello"))
	rr := httptest.NewRecorder()

	newUploadFilesHTTPService(srv).handleUploadFiles(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
}

func TestUploadFilesHTTPService_HandleUploadFiles_ReturnsUploadNotFound(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	srv := &server{cfg: config.Config{DataDir: dataDir}, store: st}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/missing/files", bytes.NewBufferString("hello"))
	req.Header.Set("X-Profile-Id", profile.ID)
	req = withUploadIDParam(req, "missing")
	rr := httptest.NewRecorder()

	newUploadFilesHTTPService(srv).handleUploadFiles(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNotFound)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "not_found" {
		t.Fatalf("resp.Error.Code=%q, want not_found", resp.Error.Code)
	}
}

func TestLoadWritableUploadSession_ReturnsNotSupportedForPresigned(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	_, _, uploadErr := srv.loadWritableUploadSession(store.UploadSession{
		ID:        "upload-1",
		Mode:      uploadModePresigned,
		ExpiresAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
	})
	if uploadErr == nil {
		t.Fatalf("expected error")
	}
	if uploadErr.code != "not_supported" {
		t.Fatalf("code=%q, want not_supported", uploadErr.code)
	}
}

func TestLoadWritableUploadSession_ResolvesStagingDir(t *testing.T) {
	dataDir := t.TempDir()
	srv := &server{cfg: config.Config{DataDir: dataDir}}
	mode, stagingDir, uploadErr := srv.loadWritableUploadSession(store.UploadSession{
		ID:         "upload-1",
		Mode:       uploadModeStaging,
		StagingDir: "present",
		ExpiresAt:  time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
	})
	if uploadErr != nil {
		t.Fatalf("unexpected error: %v", uploadErr)
	}
	if mode != uploadModeStaging {
		t.Fatalf("mode=%q, want %q", mode, uploadModeStaging)
	}
	want := filepath.Join(dataDir, "staging", "upload-1")
	if stagingDir != want {
		t.Fatalf("stagingDir=%q, want %q", stagingDir, want)
	}
}

func TestExecuteUpload_WritesPreparationError(t *testing.T) {
	svc := newUploadFilesHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))
	rr := httptest.NewRecorder()

	svc.executeUpload(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
}

func withUploadIDParam(req *http.Request, uploadID string) *http.Request {
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("uploadId", uploadID)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
	return req.WithContext(ctx)
}

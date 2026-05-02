package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestUploadCommitHTTPService_HandleCommitUpload_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/commit", bytes.NewBufferString(`{"label":"first"}`))
	rr := httptest.NewRecorder()

	newUploadCommitHTTPService(srv).handleCommitUpload(rr, req)

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
	if resp.Error.Message != "profile and uploadId are required" {
		t.Fatalf("resp.Error.Message=%q, want profile and uploadId are required", resp.Error.Message)
	}
}

func TestUploadCommitHTTPService_HandleCommitUpload_ReturnsInvalidJSON(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	srv := &server{cfg: config.Config{DataDir: dataDir, UploadDirectStream: false}, store: st}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/commit", bytes.NewBufferString(`{"label":"first"}{`))
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("Content-Type", "application/json")
	req = withUploadIDParam(req, upload.ID)
	rr := httptest.NewRecorder()

	newUploadCommitHTTPService(srv).handleCommitUpload(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_json" {
		t.Fatalf("resp.Error.Code=%q, want invalid_json", resp.Error.Code)
	}
}

func TestExecuteCommit_PreservesMissingProfileAndUploadID(t *testing.T) {
	svc := newUploadCommitHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/commit", bytes.NewBufferString(`{"label":"first"}`))

	_, uploadErr, _ := svc.executeCommit(req)

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
	if uploadErr.message != "profile and uploadId are required" {
		t.Fatalf("uploadErr.message=%q, want profile and uploadId are required", uploadErr.message)
	}
}

func TestUploadCommitRequestService_PreparePreservesLoadedSessionWhenJSONIsInvalid(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	svc := newUploadCommitRequestService(&server{
		cfg:   config.Config{DataDir: dataDir, UploadDirectStream: false},
		store: st,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/commit", bytes.NewBufferString(`{"label":"first"}{`))
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("Content-Type", "application/json")
	req = withUploadIDParam(req, upload.ID)

	session, _, uploadErr, decodeErr := svc.prepare(req)

	if uploadErr != nil {
		t.Fatalf("uploadErr=%v, want nil", uploadErr)
	}
	if decodeErr == nil {
		t.Fatal("expected decodeErr")
	}
	if session.profileID != profile.ID {
		t.Fatalf("session.profileID=%q, want %q", session.profileID, profile.ID)
	}
	if session.uploadID != upload.ID {
		t.Fatalf("session.uploadID=%q, want %q", session.uploadID, upload.ID)
	}
}

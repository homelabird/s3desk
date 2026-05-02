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

func TestUploadPresignHTTPService_HandlePresignUpload_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/presign", bytes.NewBufferString(`{"path":"file.bin"}`))
	rr := httptest.NewRecorder()

	newUploadPresignHTTPService(srv).handlePresignUpload(rr, req)

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

func TestUploadPresignHTTPService_HandlePresignUpload_ReturnsInvalidJSON(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	srv := &server{cfg: config.Config{DataDir: dataDir}, store: st}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/presign", bytes.NewBufferString(`{"path":"file.bin"}{`))
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
	req = withUploadIDParam(req, upload.ID)
	rr := httptest.NewRecorder()

	newUploadPresignHTTPService(srv).handlePresignUpload(rr, req)

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

func TestExecutePresign_PreservesMissingProfileAndUploadID(t *testing.T) {
	svc := newUploadPresignHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/presign", bytes.NewBufferString(`{"path":"file.bin"}`))

	_, uploadErr, _ := svc.executePresign(req)

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

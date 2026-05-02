package api

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestUploadDirectHTTPService_HandleDirectMultipartChunkUpload_ReturnsInvalidChunkHeader(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))
	rr := httptest.NewRecorder()

	newUploadDirectHTTPService(srv).handleDirectMultipartChunkUpload(rr, req, "profile-1", "upload-1", store.UploadSession{Bucket: "test-bucket"}, "bad")

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

func TestUploadDirectHTTPService_HandleDirectMultipartFormUpload_ReturnsMissingProfileSecrets(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("hello")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()

	newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, "profile-1", "upload-1", store.UploadSession{
		Bucket:    "test-bucket",
		ExpiresAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
	})

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusInternalServerError)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "internal_error" {
		t.Fatalf("resp.Error.Code=%q, want internal_error", resp.Error.Code)
	}
}

func TestUploadDirectHTTPService_ExecuteChunkRequest_PreservesInvalidChunkHeader(t *testing.T) {
	svc := newUploadDirectHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))

	_, _, uploadErr := svc.executeDirectMultipartChunkUpload(req, "profile-1", "upload-1", store.UploadSession{Bucket: "test-bucket"}, "bad")

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
}

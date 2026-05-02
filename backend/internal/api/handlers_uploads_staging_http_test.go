package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestUploadStagingHTTPService_HandleStagingChunkUpload_ReturnsInvalidChunkHeader(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))
	rr := httptest.NewRecorder()

	newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, "profile-1", "upload-1", t.TempDir(), 0, "bad")

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

func TestUploadStagingHTTPService_HandleStagingMultipartFormUpload_ReturnsExpectedMultipartError(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("not-multipart"))
	rr := httptest.NewRecorder()

	newUploadStagingHTTPService(srv).handleStagingMultipartFormUpload(rr, req, "profile-1", "upload-1", t.TempDir(), 0)

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

func TestUploadStagingHTTPService_ExecuteChunkRequest_PreservesInvalidChunkHeader(t *testing.T) {
	svc := newUploadStagingHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))

	_, _, uploadErr := svc.executeStagingChunkUpload(req, "profile-1", "upload-1", "/tmp/staging", 10, "bad")

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
}

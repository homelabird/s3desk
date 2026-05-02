package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestUploadSessionHTTPService_HandleCreateUploadSession_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket"}`))
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleCreateUploadSession(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
	if resp.Error.Message != "X-Profile-Id header is required" {
		t.Fatalf("resp.Error.Message=%q, want X-Profile-Id header is required", resp.Error.Message)
	}
}

func TestUploadSessionHTTPService_HandleCreateUploadSession_ReturnsInvalidJSON(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket"}{`))
	req.Header.Set("X-Profile-Id", "profile-1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleCreateUploadSession(rr, req)

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

func TestUploadSessionHTTPService_HandleDeleteUploadSession_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/uploads", nil)
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleDeleteUploadSession(rr, req)

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

func TestExecuteCreate_PreservesMissingProfile(t *testing.T) {
	svc := newUploadSessionHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket"}`))

	_, uploadErr, _ := svc.executeCreate(req)

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "missing_profile" {
		t.Fatalf("uploadErr.code=%q, want missing_profile", uploadErr.code)
	}
}

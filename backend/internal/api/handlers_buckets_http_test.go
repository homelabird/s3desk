package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestBucketHTTPService_HandleCreateBucket_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newBucketHTTPService(&server{cfg: config.Config{DataDir: t.TempDir()}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	rec := httptest.NewRecorder()

	svc.handleCreateBucket(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_json" {
		t.Fatalf("resp.Error.Code=%q, want invalid_json", resp.Error.Code)
	}
}

func TestBucketHTTPService_HandleDeleteBucket_ReturnsMissingBucket(t *testing.T) {
	t.Parallel()

	svc := newBucketHTTPService(&server{cfg: config.Config{DataDir: t.TempDir()}})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	rec := httptest.NewRecorder()

	svc.handleDeleteBucket(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
}

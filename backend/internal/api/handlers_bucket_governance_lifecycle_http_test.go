package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/bucketgov"
	"s3desk/internal/models"
)

func TestBucketLifecycleHTTPService_HandleGetBucketLifecycle_ReturnsMissingProfile(t *testing.T) {
	t.Parallel()

	svc := newBucketLifecycleHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/lifecycle", nil)
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetBucketLifecycle(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
}

func TestBucketLifecycleHTTPService_HandlePutBucketLifecycle_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newBucketLifecycleHTTPService(&server{bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry())})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/lifecycle", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handlePutBucketLifecycle(rec, req)

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

func TestBucketLifecycleHTTPService_HandleGetBucketLifecycle_ReturnsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	svc := newBucketLifecycleHTTPService(&server{bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry())})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/lifecycle", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetBucketLifecycle(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "bucket_lifecycle_unsupported" {
		t.Fatalf("resp.Error.Code=%q, want bucket_lifecycle_unsupported", resp.Error.Code)
	}
}

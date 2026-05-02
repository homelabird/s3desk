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

func TestBucketEncryptionHTTPService_HandleGetBucketEncryption_ReturnsMissingProfile(t *testing.T) {
	t.Parallel()

	svc := newBucketEncryptionHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/encryption", nil)
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetBucketEncryption(rec, req)

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

func TestBucketEncryptionHTTPService_HandlePutBucketEncryption_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newBucketEncryptionHTTPService(&server{bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry())})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/encryption", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handlePutBucketEncryption(rec, req)

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

func TestBucketEncryptionHTTPService_HandleGetBucketEncryption_ReturnsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	svc := newBucketEncryptionHTTPService(&server{bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry())})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/encryption", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetBucketEncryption(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "bucket_encryption_unsupported" {
		t.Fatalf("resp.Error.Code=%q, want bucket_encryption_unsupported", resp.Error.Code)
	}
}

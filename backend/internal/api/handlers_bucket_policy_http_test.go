package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/models"
)

func TestBucketPolicyHTTPService_HandleGetBucketPolicy_ReturnsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/policy", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderOciObjectStorage})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetBucketPolicy(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "bucket_policy_unsupported" {
		t.Fatalf("resp.Error.Code=%q, want bucket_policy_unsupported", resp.Error.Code)
	}
}

func TestBucketPolicyHTTPService_HandlePutBucketPolicy_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handlePutBucketPolicy(rec, req)

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

func TestBucketPolicyHTTPService_HandlePutBucketPolicy_RequiresPolicy(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handlePutBucketPolicy(rec, req)

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

func TestBucketPolicyHTTPService_HandleDeleteBucketPolicy_ReturnsGCSPolicyDeleteUnsupported(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyHTTPService(&server{})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/demo/policy", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleDeleteBucketPolicy(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "bucket_policy_delete_unsupported" {
		t.Fatalf("resp.Error.Code=%q, want bucket_policy_delete_unsupported", resp.Error.Code)
	}
}

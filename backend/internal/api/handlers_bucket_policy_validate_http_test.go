package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/models"
)

func TestBucketPolicyValidateHTTPService_HandleValidateBucketPolicy_ReturnsMissingProfile(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyValidateHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/demo/policy/validate", bytes.NewBufferString(`{"policy":{}}`))
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleValidateBucketPolicy(rec, req)

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

func TestBucketPolicyValidateHTTPService_HandleValidateBucketPolicy_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyValidateHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/demo/policy/validate", bytes.NewBufferString(`{"policy":{}`))
	req = withBucketParam(req, "demo")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	rec := httptest.NewRecorder()

	svc.handleValidateBucketPolicy(rec, req)

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

func TestBucketPolicyValidateHTTPService_HandleValidateBucketPolicy_ReturnsPolicyRequiredResult(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyValidateHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/demo/policy/validate", bytes.NewBufferString(`{}`))
	req = withBucketParam(req, "demo")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs})
	rec := httptest.NewRecorder()

	svc.handleValidateBucketPolicy(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}
	var resp models.BucketPolicyValidateResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Ok {
		t.Fatal("resp.Ok=true, want false")
	}
	if len(resp.Errors) != 1 || resp.Errors[0] != "policy is required" {
		t.Fatalf("resp.Errors=%v, want [policy is required]", resp.Errors)
	}
	if resp.Provider != models.ProfileProviderGcpGcs {
		t.Fatalf("resp.Provider=%q, want %q", resp.Provider, models.ProfileProviderGcpGcs)
	}
}

func TestExecutePreparedBucketPolicyValidate_UsesPreparedExecution(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyValidateHTTPService(&server{})

	resp, err := svc.executePrepared(
		models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs},
		"demo",
		models.BucketPolicyPutRequest{},
	)
	if err != nil {
		t.Fatalf("err=%v, want nil", err)
	}
	if resp == nil {
		t.Fatal("expected response")
	}
	if resp.Ok {
		t.Fatal("resp.Ok=true, want false")
	}
	if len(resp.Errors) != 1 || resp.Errors[0] != "policy is required" {
		t.Fatalf("resp.Errors=%v, want [policy is required]", resp.Errors)
	}
}

func TestExecuteValidate_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyValidateHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/demo/policy/validate", nil)

	resp, err := svc.executeValidate(req)
	if err == nil {
		t.Fatal("expected error")
	}
	if resp != nil {
		t.Fatalf("resp=%+v, want nil", resp)
	}
	var reqErr *bucketPolicyValidateHTTPError
	if !errors.As(err, &reqErr) {
		t.Fatalf("err=%T, want bucketPolicyValidateHTTPError", err)
	}
	if reqErr.code != "missing_profile" {
		t.Fatalf("reqErr.code=%q, want missing_profile", reqErr.code)
	}
}

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

func TestLifecycleHTTPRejectsInvalidRulesBeforeProvider(t *testing.T) {
	t.Parallel()
	for _, rules := range []string{
		`null`,
		`[{"status":"enabled"}]`,
		`[{"status":"disabled","transitions":[]}]`,
		`[{"status":"enabled","noncurrentVersionExpiration":{"noncurrentDays":1,"newerNoncurrentVersions":0}}]`,
		`[{"status":"enabled","noncurrentVersionTransitions":[{"noncurrentDays":1,"newerNoncurrentVersions":0,"storageClass":"GLACIER"}]}]`,
		`[{"status":"enabled","expiration":{"days":1,"unknown":true}}]`,
		`[{"status":"enabled","expiration":{"days":1,"date":"2030-01-01T00:00:00Z"}}]`,
		`[{"status":"enabled","filter":{"and":{"objectSizeGreaterThan":10,"objectSizeLessThan":1}},"expiration":{"days":30}}]`,
		`[{"status":"enabled","noncurrentVersionExpiration":{"noncurrentDays":1,"newerNoncurrentVersions":101}}]`,
	} {
		t.Run(rules, func(t *testing.T) {
			adapter := &fakeGovernanceAdapter{}
			registry := bucketgov.NewRegistry()
			registry.Register(models.ProfileProviderAwsS3, adapter)
			svc := newBucketLifecycleHTTPService(&server{bucketGov: bucketgov.NewService(registry)})
			req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/lifecycle", bytes.NewBufferString(`{"rules":`+rules+`}`))
			req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3}), "demo")
			rec := httptest.NewRecorder()
			svc.handlePutBucketLifecycle(rec, req)
			if rec.Code != http.StatusBadRequest || adapter.putLifecycle != nil {
				t.Fatalf("status=%d providerCalled=%v body=%s", rec.Code, adapter.putLifecycle != nil, rec.Body.String())
			}
		})
	}
}

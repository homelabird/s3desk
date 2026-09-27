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

func TestBucketSharingHTTPService_HandleGetBucketSharing_ReturnsMissingProfile(t *testing.T) {
	t.Parallel()

	svc := newBucketSharingHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/sharing", nil)
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetBucketSharing(rec, req)

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

func TestBucketSharingHTTPService_HandlePutBucketSharing_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newBucketSharingHTTPService(&server{bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry())})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/sharing", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderOciObjectStorage})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handlePutBucketSharing(rec, req)

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

func TestSharingHTTPRejectsWriteOnlyListingBeforeProvider(t *testing.T) {
	adapter := &fakeGovernanceAdapter{}
	registry := bucketgov.NewRegistry()
	registry.Register(models.ProfileProviderOciObjectStorage, adapter)
	svc := newBucketSharingHTTPService(&server{bucketGov: bucketgov.NewService(registry)})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/sharing", bytes.NewBufferString(`{"preauthenticatedRequests":[{"name":"invalid","accessType":"AnyObjectWrite","bucketListingAction":"ListObjects","timeExpires":"2030-01-01T00:00:00Z"}]}`))
	req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderOciObjectStorage}), "demo")
	rec := httptest.NewRecorder()
	svc.handlePutBucketSharing(rec, req)
	if rec.Code != http.StatusBadRequest || adapter.putSharing != nil {
		t.Fatalf("status=%d providerCalled=%v", rec.Code, adapter.putSharing != nil)
	}
}

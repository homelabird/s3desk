package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
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

func TestBucketPolicyHTTPService_ExecuteGetThreadsAllowRemoteToProviderHelpers(t *testing.T) {
	t.Parallel()

	svc := newBucketPolicyHTTPService(&server{cfg: config.Config{AllowRemote: true}})
	cases := []struct {
		name    string
		profile models.ProfileSecrets
	}{
		{
			name: "s3",
			profile: models.ProfileSecrets{
				Provider:        models.ProfileProviderS3Compatible,
				Endpoint:        "http://127.0.0.1:9000",
				Region:          "us-east-1",
				AccessKeyID:     "access",
				SecretAccessKey: "secret",
				ForcePathStyle:  true,
			},
		},
		{
			name: "gcs",
			profile: models.ProfileSecrets{
				Provider:     models.ProfileProviderGcpGcs,
				GcpAnonymous: true,
				GcpEndpoint:  "http://127.0.0.1:4443",
			},
		},
		{
			name: "azure",
			profile: models.ProfileSecrets{
				Provider:         models.ProfileProviderAzureBlob,
				AzureAccountName: "acct",
				AzureAccountKey:  base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")),
				AzureEndpoint:    "http://127.0.0.1:10000/acct",
			},
		},
	}

	for _, tt := range cases {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/policy", nil)
			req = withProfileSecrets(req, tt.profile)
			req = withBucketParam(req, "demo")

			_, bucket, callErr, _, _, _, _, _, err := svc.executeGet(req)
			if err != nil {
				t.Fatalf("executeGet err=%v, want provider call error", err)
			}
			if bucket != "demo" {
				t.Fatalf("bucket=%q, want demo", bucket)
			}
			if callErr == nil || !strings.Contains(callErr.Error(), "loopback or link-local") {
				t.Fatalf("callErr=%v, want loopback rejection", callErr)
			}
		})
	}
}

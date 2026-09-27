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
	"s3desk/internal/responsebody"
)

func TestParseXMLErrorBoundsDeserialization(t *testing.T) {
	t.Parallel()

	body := []byte(`<Error><Code>NoSuchBucketPolicy</Code></Error>`)
	if got := parseXMLError(body); got.Code != "NoSuchBucketPolicy" {
		t.Fatalf("Code=%q, want NoSuchBucketPolicy", got.Code)
	}

	body = append(body, bytes.Repeat([]byte(" "), int(responsebody.ControlPlaneMaxBytes))...)
	if got := parseXMLError(body); got.Code != "" {
		t.Fatalf("oversized Code=%q, want empty", got.Code)
	}
}

func TestBucketPolicyPutRejectsInvalidPolicyBeforeProviderCall(t *testing.T) {
	for _, provider := range []models.ProfileProvider{
		models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible,
		models.ProfileProviderGcpGcs, models.ProfileProviderAzureBlob,
		models.ProfileProviderOciObjectStorage, "unknown",
	} {
		t.Run(string(provider), func(t *testing.T) {
			// A nil provider service would panic if validation allowed the request through.
			svc := bucketPolicyHTTPService{server: &server{}}
			req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(`{"policy":[]}`))
			req = withProfileSecrets(req, models.ProfileSecrets{Provider: provider})
			req = withBucketParam(req, "demo")
			rec := httptest.NewRecorder()
			svc.handlePutBucketPolicy(rec, req)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "policy validation failed") {
				t.Fatalf("status=%d, body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}

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

func TestBucketPolicyPutRejectsGCSConditionWithoutVersion(t *testing.T) {
	// No provider service: the invalid request must stop before external mutation.
	svc := bucketPolicyHTTPService{server: &server{}}
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(`{"policy":{"bindings":[{"role":"roles/storage.objectViewer","members":["user:reader@example.test"],"condition":{"title":"limited","expression":"true"}}]}}`))
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()
	svc.handlePutBucketPolicy(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "conditions require policy version 3") {
		t.Fatalf("status=%d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestBucketPolicyPutRejectsAzureNullFields(t *testing.T) {
	for _, field := range []string{"start", "expiry", "permission"} {
		t.Run(field, func(t *testing.T) {
			svc := bucketPolicyHTTPService{server: &server{}}
			req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(`{"policy":{"publicAccess":"private","storedAccessPolicies":[{"id":"reader","`+field+`":null}]}}`))
			req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAzureBlob})
			req = withBucketParam(req, "demo")
			rec := httptest.NewRecorder()
			svc.handlePutBucketPolicy(rec, req)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), field+" must be a string") {
				t.Fatalf("status=%d, body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestBucketPolicyPutRejectsInvalidS3Effect(t *testing.T) {
	for _, effect := range []string{`null`, `"allow"`, `"Permit"`} {
		svc := bucketPolicyHTTPService{server: &server{}}
		req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(`{"policy":{"Statement":[{"Effect":`+effect+`,"Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::demo/*"}]}}`))
		req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
		req = withBucketParam(req, "demo")
		rec := httptest.NewRecorder()
		svc.handlePutBucketPolicy(rec, req)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), ".Effect") {
			t.Fatalf("effect=%s status=%d body=%s", effect, rec.Code, rec.Body.String())
		}
	}
}

func TestRawGCSPolicyConflictMapping(t *testing.T) {
	for _, status := range []int{http.StatusConflict, http.StatusPreconditionFailed} {
		rec := httptest.NewRecorder()
		(&server{}).writeGenericPolicyUpstreamError(rec, "put", "demo", status, http.Header{}, []byte(`{"error":{"message":"etag mismatch"}}`), "gcs")
		var response models.ErrorResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if rec.Code != http.StatusConflict || response.Error.Code != "bucket_policy_conflict" {
			t.Fatalf("status=%d code=%s", rec.Code, response.Error.Code)
		}
	}
}

func TestRawGCSPolicyHTTPPreservesETagAndDoesNotRetryConflict(t *testing.T) {
	calls := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method == http.MethodGet {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if r.Method != http.MethodPut || r.URL.Path != "/storage/v1/b/demo/iam" {
			t.Errorf("unexpected provider request: %s %s", r.Method, r.URL.Path)
		}
		var policy map[string]any
		if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
			t.Error(err)
		}
		if policy["etag"] != "edited-revision" {
			t.Errorf("etag changed: %v", policy["etag"])
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusPreconditionFailed)
		_, _ = w.Write([]byte(`{"error":{"code":412,"message":"etag mismatch"}}`))
	}))
	defer provider.Close()
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(`{"policy":{"version":3,"etag":"edited-revision","bindings":[]}}`))
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs, GcpAnonymous: true, GcpEndpoint: provider.URL})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()
	newBucketPolicyHTTPService(&server{}).handlePutBucketPolicy(rec, req)
	var response models.ErrorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusConflict || response.Error.Code != "bucket_policy_conflict" || calls != 3 {
		t.Fatalf("status=%d code=%s provider calls=%d", rec.Code, response.Error.Code, calls)
	}
}

func TestS3ConditionValidationOnPut(t *testing.T) {
	for _, provider := range []models.ProfileProvider{models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible} {
		for _, condition := range []string{`null`, `[]`, `{"Bool":false}`, `{"StringEquals":{"s3:prefix":[]}}`} {
			svc := bucketPolicyHTTPService{server: &server{}}
			body := `{"policy":{"Statement":{"Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"*","Condition":` + condition + `}}}`
			req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(body))
			req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: provider}), "demo")
			rec := httptest.NewRecorder()
			// Missing provider service ensures invalid inputs never reach mutation.
			svc.handlePutBucketPolicy(rec, req)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "Condition") {
				t.Fatalf("provider=%s condition=%s status=%d body=%s", provider, condition, rec.Code, rec.Body.String())
			}
		}
		body := `{"policy":{"Statement":{"Effect":"Deny","Principal":"*","Action":"s3:*","Resource":"*","Condition":{"Bool":{"aws:SecureTransport":false}}}}}`
		req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(body))
		req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: provider}), "demo")
		_, _, parsed, err := (bucketPolicyHTTPService{server: &server{}}).preparePutBucketPolicy(req)
		if err != nil || !strings.Contains(string(parsed.Policy), `"aws:SecureTransport":false`) {
			t.Fatalf("valid policy rejected or altered: provider=%s err=%v policy=%s", provider, err, parsed.Policy)
		}
	}
}

func TestGCSRawPolicyMissingETagRejectedBeforeProviderCall(t *testing.T) {
	for _, policy := range []string{`{"bindings":[]}`, `{"etag":"","bindings":[]}`, `{"etag":"  ","bindings":[]}`} {
		svc := bucketPolicyHTTPService{server: &server{}}
		req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(`{"policy":`+policy+`}`))
		req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs}), "demo")
		rec := httptest.NewRecorder()
		svc.handlePutBucketPolicy(rec, req)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "etag") {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
	}
}

func TestS3PrincipalKindsRejectedBeforePolicyWrite(t *testing.T) {
	for _, provider := range []models.ProfileProvider{models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible} {
		for _, field := range []string{"Principal", "NotPrincipal"} {
			svc := bucketPolicyHTTPService{server: &server{}}
			body := `{"policy":{"Statement":{"Effect":"Deny","` + field + `":{"User":"example"},"Action":"s3:GetObject","Resource":"arn:aws:s3:::demo/*"}}}`
			req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(body))
			req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: provider}), "demo")
			rec := httptest.NewRecorder()
			svc.handlePutBucketPolicy(rec, req)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "unsupported principal type") {
				t.Fatalf("provider=%s field=%s status=%d body=%s", provider, field, rec.Code, rec.Body.String())
			}
		}
	}
}

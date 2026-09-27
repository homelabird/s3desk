package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"s3desk/internal/models"
	"strings"
	"testing"
)

func TestRawPolicyReadback(t *testing.T) {
	for _, tc := range []struct {
		name, body   string
		status, want int
	}{
		{"match", `{"etag":"new","version":3,"bindings":[]}`, 200, 204},
		{"missing revision", `{"version":3,"bindings":[]}`, 200, 502},
		{"missing bindings", `{"etag":"new","version":3}`, 200, 502},
		{"null", `null`, 200, 502},
		{"read denied", `{}`, 403, 502},
	} {
		t.Run(tc.name, func(t *testing.T) {
			writes, reads := 0, 0
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.Method == http.MethodPut {
					writes++
					w.WriteHeader(200)
					_, _ = w.Write([]byte(`{}`))
					return
				}
				reads++
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer provider.Close()
			req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy", strings.NewReader(`{"policy":{"etag":"old","version":3,"bindings":[]}}`))
			req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs, GcpAnonymous: true, GcpEndpoint: provider.URL}), "demo")
			rec := httptest.NewRecorder()
			newBucketPolicyHTTPService(&server{}).handlePutBucketPolicy(rec, req)
			if rec.Code != tc.want || writes != 1 || reads != 2 {
				t.Fatalf("status=%d writes=%d reads=%d body=%s", rec.Code, writes, reads, rec.Body.String())
			}
		})
	}
}

func TestRawS3DeleteReadback(t *testing.T) {
	for _, tc := range []struct {
		name, body   string
		status, want int
	}{
		{"absent", `<Error><Code>NoSuchBucketPolicy</Code></Error>`, 404, 204},
		{"bucket absent", `<Error><Code>NoSuchBucket</Code></Error>`, 404, 502},
		{"still exists", `{"Statement":[]}`, 200, 502},
		{"denied", `<Error><Code>AccessDenied</Code></Error>`, 403, 502},
	} {
		t.Run(tc.name, func(t *testing.T) {
			writes, reads := 0, 0
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodDelete {
					writes++
					w.WriteHeader(204)
					return
				}
				reads++
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer provider.Close()
			req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/demo/policy", nil)
			req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible, Endpoint: provider.URL, Region: "us-east-1", AccessKeyID: "fixture", SecretAccessKey: "fixture", ForcePathStyle: true}), "demo")
			rec := httptest.NewRecorder()
			newBucketPolicyHTTPService(&server{}).handleDeleteBucketPolicy(rec, req)
			if rec.Code != tc.want || writes != 1 || reads != 2 {
				t.Fatalf("status=%d writes=%d reads=%d body=%s", rec.Code, writes, reads, rec.Body.String())
			}
		})
	}
}

func TestRawPolicyComparisonKeepsNumbersAndRejectsIncompleteJSON(t *testing.T) {
	for _, body := range []string{`{"value":9007199254740992}`, `null`, `{}`, `{"value":9007199254740993} {}`} {
		if rawPolicyMatches(models.ProfileProviderAwsS3, []byte(`{"value":9007199254740993}`), []byte(body)) {
			t.Fatalf("unexpected match: %s", body)
		}
	}
	if !rawPolicyMatches(models.ProfileProviderAwsS3, []byte(`{"b":2,"a":1}`), []byte(`{"a":1,"b":2}`)) {
		t.Fatal("object order must not matter")
	}
}

func TestRawPolicyNormalization(t *testing.T) {
	for _, tc := range []struct {
		name      string
		provider  models.ProfileProvider
		want, got string
		match     bool
	}{
		{"gcs ordering", models.ProfileProviderGcpGcs, `{"etag":"old","bindings":[{"role":"r1","members":["b","a"]},{"role":"r2","members":["c"]}]}`, `{"etag":"new","bindings":[{"role":"r2","members":["c"]},{"role":"r1","members":["a","b"]}]}`, true},
		{"gcs condition preserved", models.ProfileProviderGcpGcs, `{"etag":"old","bindings":[{"role":"r","members":["a"],"condition":{"expression":"true"}}]}`, `{"etag":"new","bindings":[{"role":"r","members":["a"],"condition":{"expression":"false"}}]}`, false},
		{"azure dates ordering", models.ProfileProviderAzureBlob, `{"publicAccess":"private","storedAccessPolicies":[{"id":"a","start":"2026-01-01"},{"id":"b"}]}`, `{"publicAccess":"private","storedAccessPolicies":[{"id":"b"},{"id":"a","start":"2026-01-01T09:00:00+09:00"}]}`, true},
		{"azure missing list", models.ProfileProviderAzureBlob, `{"publicAccess":"private","storedAccessPolicies":[]}`, `{"publicAccess":"private"}`, false},
		{"s3 scalar sets", models.ProfileProviderAwsS3, `{"Statement":{"Action":"s3:GetObject","Resource":"r","Principal":{"AWS":"p"}}}`, `{"Statement":[{"Action":["s3:GetObject"],"Resource":["r"],"Principal":{"AWS":["p"]}}]}`, true},
		{"unknown fields retained", models.ProfileProviderAwsS3, `{"Statement":[],"unknown":true}`, `{"Statement":[]}`, false},
		{"duplicates retained", models.ProfileProviderGcpGcs, `{"etag":"a","bindings":[{"members":["a","a"]}]}`, `{"etag":"b","bindings":[{"members":["a"]}]}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if actual := rawPolicyMatches(tc.provider, []byte(tc.want), []byte(tc.got)); actual != tc.match {
				t.Fatalf("match=%v want=%v", actual, tc.match)
			}
		})
	}
}

func TestRawPolicyAuditSummaryExcludesPolicyValues(t *testing.T) {
	observed := &models.BucketPolicyResponse{Exists: true, Policy: json.RawMessage(`{"Statement":[{"Principal":"secret-principal","Resource":"secret-resource"}],"signedUrl":"secret-url"}`)}
	body, err := json.Marshal(rawPolicyAuditSummary(observed))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "secret") || !strings.Contains(string(body), `"Statement_count":1`) {
		t.Fatalf("unsafe or incomplete summary: %s", body)
	}
	if rawPolicyAuditSummary(nil)["known"] != false {
		t.Fatal("missing observation must remain unknown")
	}
}

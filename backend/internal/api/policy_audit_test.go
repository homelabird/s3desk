package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"s3desk/internal/logging"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestPolicyAuditFieldsExcludeSecretsAndDoNotClaimApplied(t *testing.T) {
	srv := &server{cfg: config.Config{APIToken: "secret-api-token"}}
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/policy?signature=secret-signature", strings.NewReader(`{"secret":"private-policy"}`))
	req.Header.Set("X-Profile-Id", "untrusted-header")
	req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{ID: "authorized-profile", Provider: models.ProfileProviderAwsS3, SecretAccessKey: "provider-secret"}), "demo")
	for status, expected := range map[int]string{0: "started", 200: "accepted_unverified", 400: "unconfirmed", 502: "unconfirmed"} {
		fields := srv.policyAuditFields(req, status)
		if fields["validation_rules_version"] != "2026-09-27.10" || fields["app_version"] == "" {
			t.Fatal("missing validation/build provenance")
		}
		if fields["outcome"] != expected || fields["profile_id"] != "authorized-profile" || fields["bucket"] != "demo" {
			t.Fatalf("fields=%v", fields)
		}
		data, err := json.Marshal(fields)
		if err != nil {
			t.Fatal(err)
		}
		for _, secret := range []string{"secret-api-token", "secret-signature", "private-policy", "provider-secret", "untrusted-header"} {
			if strings.Contains(string(data), secret) {
				t.Fatalf("audit exposed %q", secret)
			}
		}
	}
}

func TestPolicyAuditMiddlewareLogsOnlyMutationsWithoutResponseBodies(t *testing.T) {
	if os.Getenv("S3DESK_POLICY_AUDIT_TEST_HELPER") == "1" {
		if _, err := logging.Setup("json"); err != nil {
			t.Fatal(err)
		}
		srv := &server{}
		handler := srv.policyAudit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Test", "preserved")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte("https://example.test/private?signature=secret-signed-url"))
		}))
		for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete} {
			req := httptest.NewRequest(method, "/api/v1/buckets/demo/governance/sharing", nil)
			req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{ID: "profile", Provider: models.ProfileProviderOciObjectStorage}), "demo")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusCreated || rec.Header().Get("X-Test") != "preserved" || !strings.Contains(rec.Body.String(), "secret-signed-url") {
				t.Fatal("middleware changed response")
			}
		}
		return
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(executable, "-test.run=^TestPolicyAuditMiddlewareLogsOnlyMutationsWithoutResponseBodies$")
	cmd.Env = append(os.Environ(), "S3DESK_POLICY_AUDIT_TEST_HELPER=1")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("helper failed: %v %s", err, output)
	}
	count := 0
	for _, line := range strings.Split(string(output), "\n") {
		if !strings.HasPrefix(line, "{") {
			continue
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		if event["event"] != "bucket.policy.change" {
			continue
		}
		count++
		if event["method"] != "PUT" && event["method"] != "DELETE" {
			t.Fatalf("non-mutation logged: %v", event)
		}
		if event["outcome"] != "started" && event["outcome"] != "accepted_unverified" {
			t.Fatalf("unexpected outcome: %v", event)
		}
	}
	if count != 4 {
		t.Fatalf("events=%d output=%s", count, output)
	}
	if strings.Contains(string(output), "secret-signed-url") {
		t.Fatal("response body leaked into audit")
	}
}

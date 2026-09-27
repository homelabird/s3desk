package azureacl

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/responsebody"
)

func TestGetContainerPolicyDoesNotHideMalformedResponse(t *testing.T) {
	for _, tc := range []struct {
		body    string
		invalid bool
		count   int
	}{
		{body: ""},
		{body: `<SignedIdentifiers/>`},
		{body: `<SignedIdentifiers><SignedIdentifier><Id>read</Id><AccessPolicy><Permission>r</Permission></AccessPolicy></SignedIdentifier></SignedIdentifiers>`, count: 1},
		{body: `<SignedIdentifiers>`, invalid: true},
		{body: `<html>upstream error</html>`, invalid: true},
		{body: `<SignedIdentifiers><SignedIdentifier><AccessPolicy><Permission>r</Permission></AccessPolicy></SignedIdentifier></SignedIdentifiers>`, invalid: true},
	} {
		t.Run(tc.body, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			profile := loopbackAzureProfile()
			profile.AzureEndpoint = srv.URL
			resp, err := GetContainerPolicy(t.Context(), profile, "demo")
			if (err != nil) != tc.invalid {
				t.Fatalf("error=%v; invalid=%v", err, tc.invalid)
			}
			if tc.invalid {
				if len(resp.Body) != 0 {
					t.Fatal("invalid response must not produce an editable empty policy")
				}
				return
			}
			var policy Policy
			if err := json.Unmarshal(resp.Body, &policy); err != nil || len(policy.StoredAccessPolicies) != tc.count {
				t.Fatalf("policy=%+v error=%v", policy, err)
			}
		})
	}
}

func TestResolveEndpointUsesSharedEmulatorDefault(t *testing.T) {
	t.Parallel()

	u, accountName, accountKey, err := resolveEndpoint(models.ProfileSecrets{
		AzureAccountName: "acct",
		AzureAccountKey:  "key",
		AzureUseEmulator: true,
	})
	if err != nil {
		t.Fatalf("resolveEndpoint: %v", err)
	}
	if accountName != "acct" {
		t.Fatalf("accountName=%q, want acct", accountName)
	}
	if accountKey != "key" {
		t.Fatalf("accountKey=%q, want key", accountKey)
	}
	if got := u.String(); got != "http://azurite:10000/acct" {
		t.Fatalf("endpoint=%q, want %q", got, "http://azurite:10000/acct")
	}
}

func TestGetContainerPolicyRejectsOversizedControlPlaneResponse(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat("x", int(responsebody.ControlPlaneMaxBytes)+1)))
	}))
	defer srv.Close()

	_, err := GetContainerPolicy(t.Context(), models.ProfileSecrets{
		AzureAccountName: "acct",
		AzureAccountKey:  base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")),
		AzureEndpoint:    srv.URL,
	}, "demo")
	if err == nil {
		t.Fatal("expected oversized response error")
	}
	if !strings.Contains(err.Error(), "http response body exceeds") {
		t.Fatalf("error=%q, want response body limit", err.Error())
	}
}

func TestGetContainerPolicyWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := GetContainerPolicyWithOptions(t.Context(), loopbackAzureProfile(), "demo", ClientOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("GetContainerPolicyWithOptions err=%v, want loopback rejection", err)
	}
}

func TestGetBlobServicePropertiesWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := GetBlobServicePropertiesWithOptions(t.Context(), loopbackAzureProfile(), ClientOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("GetBlobServicePropertiesWithOptions err=%v, want loopback rejection", err)
	}
}

func loopbackAzureProfile() models.ProfileSecrets {
	return models.ProfileSecrets{
		AzureAccountName: "acct",
		AzureAccountKey:  base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")),
		AzureEndpoint:    "http://127.0.0.1:10000/acct",
	}
}

func TestPutContainerPolicyRejectsDiscardedFieldsBeforeRequest(t *testing.T) {
	for _, policy := range []string{
		`{"publicAccess":"private","storedAccessPolicies":[],"unknown":true}`,
		`{"publicAccess":"private","storedAccessPolicies":[{"id":"reader","permissions":"r"}]}`,
		`{"publicAccess":"private","storedAccessPolicies":[]} {}`,
	} {
		calls := 0
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(http.StatusOK) }))
		_, err := PutContainerPolicy(t.Context(), models.ProfileSecrets{
			AzureAccountName: "acct", AzureAccountKey: base64.StdEncoding.EncodeToString([]byte("test-key")), AzureEndpoint: srv.URL,
		}, "demo", []byte(policy))
		srv.Close()
		if err == nil || calls != 0 {
			t.Fatalf("error=%v requests=%d", err, calls)
		}
	}
}

func TestPutContainerPolicyRejectsInvalidIdentifiersBeforeRequest(t *testing.T) {
	for _, ids := range [][]string{{""}, {strings.Repeat("x", 65)}, {"same", " same "}, {"a", "b", "c", "d", "e", "f"}} {
		policies := []StoredAccessPolicy{}
		for _, id := range ids {
			policies = append(policies, StoredAccessPolicy{ID: id})
		}
		body, err := json.Marshal(Policy{PublicAccess: "private", StoredAccessPolicies: policies})
		if err != nil {
			t.Fatal(err)
		}
		_, err = PutContainerPolicy(t.Context(), models.ProfileSecrets{}, "demo", body)
		if err == nil || (!strings.Contains(err.Error(), "stored access policy") && !strings.Contains(err.Error(), "stored access policies")) {
			t.Fatalf("ids=%q: expected identifier rejection before client setup, got %v", ids, err)
		}
	}
}

func TestValidateStoredPolicyPermission(t *testing.T) {
	for _, permission := range []string{"", "r", "racwd", "x", "y", "t", "f", "m", "e", "o", "p", "i", " rl "} {
		if err := ValidateStoredPolicyPermission(permission); err != nil {
			t.Errorf("valid %q: %v", permission, err)
		}
	}
	for _, permission := range []string{"u", "R", "rr", "r l", "?"} {
		if err := ValidateStoredPolicyPermission(permission); err == nil {
			t.Errorf("accepted invalid %q", permission)
		}
	}
}

func TestGetContainerPolicyRejectsUnknownPublicAccess(t *testing.T) {
	for _, value := range []string{"", "blob", "container", "unknown"} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			if value != "" {
				w.Header().Set("x-ms-blob-public-access", value)
			}
			w.WriteHeader(http.StatusOK)
		}))
		profile := loopbackAzureProfile()
		profile.AzureEndpoint = srv.URL
		resp, err := GetContainerPolicy(t.Context(), profile, "demo")
		srv.Close()
		if value == "unknown" {
			if err == nil || len(resp.Body) != 0 {
				t.Fatalf("unknown access produced editable policy: err=%v body=%s", err, resp.Body)
			}
			continue
		}
		var policy Policy
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			t.Fatal(err)
		}
		expected := value
		if expected == "" {
			expected = "private"
		}
		if policy.PublicAccess != expected {
			t.Fatalf("access=%q want %q", policy.PublicAccess, expected)
		}
	}
}

func TestSoftDeleteWriteDoesNotSendVersioningXML(t *testing.T) {
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		payload, err := io.ReadAll(req.Body)
		if err != nil {
			t.Error(err)
		}
		body = string(payload)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()
	profile := loopbackAzureProfile()
	profile.AzureEndpoint = srv.URL
	_, err := PutBlobServiceProperties(t.Context(), profile, []byte(`{"deleteRetentionPolicy":{"enabled":false}}`))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "<Enabled>false</Enabled>") || strings.Contains(body, "IsVersioningEnabled") {
		t.Fatalf("unexpected XML: %s", body)
	}
}

func TestStoredPolicyTimeFormats(t *testing.T) {
	for _, value := range []string{"2026-09-27", "2026-09-27T12:30Z", "2026-09-27T12:30:45Z", "2026-09-27T12:30:45.1234567Z", "2026-09-27T12:30:45+00:00"} {
		if err := ValidateStoredPolicyTime(value); err != nil {
			t.Errorf("valid %q: %v", value, err)
		}
	}
	for _, value := range []string{"", "2026-02-30", "2026-09-27T12:30", "2026-09-27T25:30Z", "tomorrow"} {
		if err := ValidateStoredPolicyTime(value); err == nil {
			t.Errorf("invalid %q accepted", value)
		}
	}
}

func TestPutContainerPolicyRejectsInvalidTimesBeforeClientSetup(t *testing.T) {
	for _, policy := range []StoredAccessPolicy{
		{ID: "reader", Start: "2026-02-30"},
		{ID: "reader", Expiry: "tomorrow"},
		{ID: "reader", Start: "2026-09-27T12:30"},
	} {
		body, err := json.Marshal(Policy{PublicAccess: "private", StoredAccessPolicies: []StoredAccessPolicy{policy}})
		if err != nil {
			t.Fatal(err)
		}
		_, err = PutContainerPolicy(t.Context(), models.ProfileSecrets{}, "demo", body)
		if err == nil || !strings.Contains(err.Error(), "ISO 8601") {
			t.Fatalf("expected time rejection before client setup: %v", err)
		}
	}
}

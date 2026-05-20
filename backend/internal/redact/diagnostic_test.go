package redact

import (
	"strings"
	"testing"
)

func TestDiagnosticRedactsCommonSecretsAndKeepsContext(t *testing.T) {
	t.Parallel()

	input := strings.Join([]string{
		"AccessDenied for bucket reports request id req-123",
		"access_key_id=AKIA-SECRET",
		"secret_access_key: secret-value",
		"Authorization: Bearer auth-secret",
		"Cookie: session=cookie-secret",
		"https://s3.example/reports/object.txt?X-Amz-Signature=signature-secret&partNumber=7",
		"-----BEGIN PRIVATE KEY----- private-secret -----END PRIVATE KEY-----",
	}, "\n")
	got := Diagnostic(input)

	for _, secret := range []string{"AKIA-SECRET", "secret-value", "auth-secret", "cookie-secret", "signature-secret", "private-secret"} {
		if strings.Contains(got, secret) {
			t.Fatalf("Diagnostic leaked %q in %q", secret, got)
		}
	}
	for _, context := range []string{"AccessDenied", "reports", "req-123", "partNumber=7", Marker} {
		if !strings.Contains(got, context) {
			t.Fatalf("Diagnostic lost %q in %q", context, got)
		}
	}
}

func TestDiagnosticRedactsProviderSpecificSecretShapes(t *testing.T) {
	t.Parallel()

	input := strings.Join([]string{
		"azure sas_url=https://acct.blob.core.windows.net/container?sv=2024-01-01&sig=azure-sig-secret",
		"shared_access_signature=azure-shared-access-secret",
		"b2 application_key=b2-application-secret",
		"oci key_content=oci-key-secret",
		"oci key_file_pass_phrase=oci-passphrase-secret",
		"client_certificate_password: cert-password-secret",
		`service_account_credentials="{\"private_key\":\"json-private-secret\"}"`,
		"https://oauth.example/callback?client_secret=query-client-secret&state=kept",
	}, "\n")
	got := Diagnostic(input)

	for _, secret := range []string{
		"azure-sig-secret",
		"azure-shared-access-secret",
		"b2-application-secret",
		"oci-key-secret",
		"oci-passphrase-secret",
		"cert-password-secret",
		"json-private-secret",
		"query-client-secret",
	} {
		if strings.Contains(got, secret) {
			t.Fatalf("Diagnostic leaked %q in %q", secret, got)
		}
	}
	for _, context := range []string{"azure", "b2", "oci", "state=kept", Marker} {
		if !strings.Contains(got, context) {
			t.Fatalf("Diagnostic lost %q in %q", context, got)
		}
	}
}

func TestDiagnosticDetailsRedactsNestedSecretFields(t *testing.T) {
	t.Parallel()

	got := DiagnosticDetails(map[string]any{
		"bucket":     "reports",
		"accountKey": "account-secret",
		"sasURL":     "https://acct.blob.core.windows.net/container?sig=details-sig-secret",
		"nested": map[string]any{
			"message":     "useful access_token=nested-secret",
			"password":    "password-secret",
			"credentials": "credentials-secret",
		},
	})

	if got["accountKey"] != Marker {
		t.Fatalf("accountKey=%v, want marker", got["accountKey"])
	}
	if got["sasURL"] != Marker {
		t.Fatalf("sasURL=%v, want marker", got["sasURL"])
	}
	nested := got["nested"].(map[string]any)
	if nested["password"] != Marker {
		t.Fatalf("password=%v, want marker", nested["password"])
	}
	if nested["credentials"] != Marker {
		t.Fatalf("credentials=%v, want marker", nested["credentials"])
	}
	message := nested["message"].(string)
	if strings.Contains(message, "nested-secret") || !strings.Contains(message, "useful") {
		t.Fatalf("nested message=%q", message)
	}
}

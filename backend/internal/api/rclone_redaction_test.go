package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/bucketpolicy"
	"s3desk/internal/models"
)

func TestWriteRcloneAPIError_RedactsDiagnosticsAndKeepsContext(t *testing.T) {
	t.Parallel()

	stderr := strings.Join([]string{
		"AccessDenied: request id req-123 denied access to bucket reports",
		"access_key_id = AKIA-SECRET-123",
		"secret_access_key=secret-value-123",
		"session_token: session-value-123",
		"Authorization: Bearer auth-secret-123",
		"Cookie: session=cookie-secret-123",
		"https://s3.example.invalid/reports/object.txt?X-Amz-Credential=credential-secret-123&X-Amz-Signature=signature-secret-123&X-Amz-Security-Token=query-token-secret-123&partNumber=1",
		"https://account.blob.core.windows.net/container/blob?sp=r&sig=sas-secret-123&sr=b",
		"private_key=-----BEGIN PRIVATE KEY----- private-secret-123 -----END PRIVATE KEY-----",
		"password=hunter2",
		`api_token="api-secret-123"`,
	}, "\n")

	rr := httptest.NewRecorder()
	writeRcloneAPIError(rr, errors.New("exit status 1"), stderr, rcloneAPIErrorContext{
		MissingMessage: "missing",
		DefaultStatus:  http.StatusBadGateway,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to list objects",
	}, map[string]any{
		"bucket":      "reports",
		"diagnostic":  "safe context; account_key=account-key-secret",
		"account_key": "explicit-account-key-secret",
		"nested": map[string]any{
			"password": "nested-password-secret",
			"message":  "nested useful context access_token=nested-access-token-secret",
		},
	})

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	bodyBytes := rr.Body.Bytes()
	body := string(bodyBytes)
	for _, secret := range []string{
		"AKIA-SECRET-123",
		"secret-value-123",
		"session-value-123",
		"auth-secret-123",
		"cookie-secret-123",
		"credential-secret-123",
		"signature-secret-123",
		"query-token-secret-123",
		"sas-secret-123",
		"private-secret-123",
		"hunter2",
		"api-secret-123",
		"account-key-secret",
		"explicit-account-key-secret",
		"nested-password-secret",
		"nested-access-token-secret",
	} {
		if strings.Contains(body, secret) {
			t.Fatalf("response leaked secret %q in body: %s", secret, body)
		}
	}
	for _, context := range []string{
		"AccessDenied",
		"request id req-123",
		"reports",
		"partNumber=1",
		"safe context",
		"nested useful context",
	} {
		if !strings.Contains(body, context) {
			t.Fatalf("response lost context %q in body: %s", context, body)
		}
	}

	var resp models.ErrorResponse
	if err := json.Unmarshal(bodyBytes, &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got := resp.Error.Details["account_key"]; got != rcloneDiagnosticRedacted {
		t.Fatalf("account_key detail=%v, want redacted marker", got)
	}
	nested, ok := resp.Error.Details["nested"].(map[string]any)
	if !ok {
		t.Fatalf("nested details=%T, want map[string]any", resp.Error.Details["nested"])
	}
	if got := nested["password"]; got != rcloneDiagnosticRedacted {
		t.Fatalf("nested password=%v, want redacted marker", got)
	}
}

func TestWriteS3PolicyUpstreamError_RedactsProviderDiagnosticsAndKeepsContext(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	(&server{}).writeS3PolicyUpstreamError(rr, "get", "reports", bucketpolicy.Response{
		Status:  http.StatusForbidden,
		Headers: http.Header{"x-amz-request-id": []string{"req-456"}},
		Body:    []byte(`<Error><Code>AccessDenied</Code><Message>AccessDenied for reports secret_access_key=provider-secret-123 url=https://s3.example.invalid/reports/object.txt?X-Amz-Signature=provider-signature-secret-123&amp;partNumber=2</Message><RequestId>req-body</RequestId></Error>`),
	})

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	bodyBytes := rr.Body.Bytes()
	body := string(bodyBytes)
	for _, secret := range []string{"provider-secret-123", "provider-signature-secret-123"} {
		if strings.Contains(body, secret) {
			t.Fatalf("response leaked secret %q in body: %s", secret, body)
		}
	}
	for _, context := range []string{"AccessDenied", "reports", "req-body", "partNumber=2"} {
		if !strings.Contains(body, context) {
			t.Fatalf("response lost context %q in body: %s", context, body)
		}
	}

	var resp models.ErrorResponse
	if err := json.Unmarshal(bodyBytes, &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	upstreamError, _ := resp.Error.Details["upstreamError"].(string)
	if !strings.Contains(upstreamError, rcloneDiagnosticRedacted) {
		t.Fatalf("upstreamError=%q, want redacted marker", upstreamError)
	}
}

package azureacl

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/responsebody"
)

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

package azureacl

import (
	"testing"

	"s3desk/internal/models"
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

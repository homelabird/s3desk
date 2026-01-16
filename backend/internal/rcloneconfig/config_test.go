package rcloneconfig

import (
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestRenderConfigS3Aws(t *testing.T) {
	profile := models.ProfileSecrets{
		Provider:        models.ProfileProviderAwsS3,
		Region:          "us-east-1",
		ForcePathStyle:  false,
		AccessKeyID:     "AKIA...",
		SecretAccessKey: "SECRET",
	}

	out, err := RenderConfig(profile, RemoteName)
	if err != nil {
		t.Fatalf("RenderConfig: %v", err)
	}
	if !strings.Contains(out, "type = s3") {
		t.Fatalf("expected type = s3, got:\n%s", out)
	}
	if !strings.Contains(out, "provider = AWS") {
		t.Fatalf("expected provider = AWS, got:\n%s", out)
	}
	if !strings.Contains(out, "region = us-east-1") {
		t.Fatalf("expected region, got:\n%s", out)
	}
	if strings.Contains(out, "endpoint =") {
		t.Fatalf("did not expect endpoint line for empty endpoint, got:\n%s", out)
	}
}

func TestRenderConfigAzureBlob(t *testing.T) {
	profile := models.ProfileSecrets{
		Provider:         models.ProfileProviderAzureBlob,
		AzureAccountName: "acct",
		AzureAccountKey:  "key",
	}

	out, err := RenderConfig(profile, RemoteName)
	if err != nil {
		t.Fatalf("RenderConfig: %v", err)
	}
	if !strings.Contains(out, "type = azureblob") {
		t.Fatalf("expected type = azureblob, got:\n%s", out)
	}
	if !strings.Contains(out, "account = acct") {
		t.Fatalf("expected account, got:\n%s", out)
	}
	if !strings.Contains(out, "key = key") {
		t.Fatalf("expected key, got:\n%s", out)
	}
}

func TestRenderConfigGcpGcsCompactsJson(t *testing.T) {
	profile := models.ProfileSecrets{
		Provider: models.ProfileProviderGcpGcs,
		GcpServiceAccountJSON: `{
			"type": "service_account",
			"project_id": "p",
			"client_email": "e",
			"private_key": "k"
		}`,
	}

	out, err := RenderConfig(profile, RemoteName)
	if err != nil {
		t.Fatalf("RenderConfig: %v", err)
	}
	if !strings.Contains(out, "type = google cloud storage") {
		t.Fatalf("expected gcs backend type, got:\n%s", out)
	}
	if !strings.Contains(out, `service_account_credentials = {"type":"service_account","project_id":"p","client_email":"e","private_key":"k"}`) {
		t.Fatalf("expected compact service_account_credentials, got:\n%s", out)
	}
}

func TestRenderConfigOciObjectStorage(t *testing.T) {
	profile := models.ProfileSecrets{
		Provider:        models.ProfileProviderOciObjectStorage,
		OciNamespace:    "ns",
		OciCompartment:  "comp",
		Region:          "us-ashburn-1",
		OciAuthProvider: "user_principal",
	}

	out, err := RenderConfig(profile, RemoteName)
	if err != nil {
		t.Fatalf("RenderConfig: %v", err)
	}
	if !strings.Contains(out, "type = oracleobjectstorage") {
		t.Fatalf("expected type = oracleobjectstorage, got:\n%s", out)
	}
	if !strings.Contains(out, "namespace = ns") {
		t.Fatalf("expected namespace, got:\n%s", out)
	}
	if !strings.Contains(out, "compartment = comp") {
		t.Fatalf("expected compartment, got:\n%s", out)
	}
	if !strings.Contains(out, "region = us-ashburn-1") {
		t.Fatalf("expected region, got:\n%s", out)
	}
}

func TestRenderConfigUnsupportedProvider(t *testing.T) {
	profile := models.ProfileSecrets{Provider: models.ProfileProvider("nope")}
	_, err := RenderConfig(profile, RemoteName)
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "unsupported provider") {
		t.Fatalf("expected unsupported provider error, got %v", err)
	}
}

package api

import (
	"net/http"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/models"
)

func TestGetMetaIncludesProviderCapabilities(t *testing.T) {
	t.Parallel()

	_, srv := newTestServer(t, testEncryptionKey())

	res := doJSONRequest(t, srv, http.MethodGet, "/api/v1/meta", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	var meta models.MetaResponse
	decodeJSONResponse(t, res, &meta)

	if !meta.Capabilities.ProfileTLS.Enabled {
		t.Fatalf("expected profileTls capability enabled when encryption key is configured")
	}
	if !meta.Capabilities.ServerBackup.Export.Enabled {
		t.Fatalf("expected sqlite test server to expose backup export capability")
	}
	if !meta.Capabilities.ServerBackup.RestoreStaging.Enabled {
		t.Fatalf("expected restore staging capability enabled")
	}
	if meta.Capabilities.ServerBackup.RestoreStaging.Reason == "" {
		t.Fatalf("expected restore staging capability reason")
	}
	if meta.DBBackend != "sqlite" {
		t.Fatalf("expected dbBackend=sqlite, got %q", meta.DBBackend)
	}

	if len(meta.Capabilities.Providers) == 0 {
		t.Fatalf("expected provider capabilities in /meta response")
	}

	expectedProviders := []models.ProfileProvider{
		models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
		models.ProfileProviderAzureBlob,
		models.ProfileProviderGcpGcs,
		models.ProfileProviderOciObjectStorage,
	}
	for _, provider := range expectedProviders {
		if _, ok := meta.Capabilities.Providers[provider]; !ok {
			t.Fatalf("missing provider capability for %q", provider)
		}
	}

	s3 := meta.Capabilities.Providers[models.ProfileProviderS3Compatible]
	if !s3.BucketPolicy || !s3.PresignedUpload || !s3.PresignedMultipartUpload {
		t.Fatalf("expected s3_compatible policy/presigned capabilities, got %+v", s3)
	}
	if !s3.Governance[models.BucketGovernanceCapabilityAccessRawPolicy].Enabled {
		t.Fatalf("expected s3_compatible raw policy governance capability, got %+v", s3.Governance)
	}
	if s3.Governance[models.BucketGovernanceCapabilityPublicAccessBlock].Enabled {
		t.Fatalf("expected s3_compatible public access block disabled by default, got %+v", s3.Governance)
	}

	aws := meta.Capabilities.Providers[models.ProfileProviderAwsS3]
	if !aws.Governance[models.BucketGovernanceCapabilityPublicAccessBlock].Enabled {
		t.Fatalf("expected aws public access block governance capability, got %+v", aws.Governance)
	}
	if !aws.Governance[models.BucketGovernanceCapabilityObjectOwnership].Enabled {
		t.Fatalf("expected aws object ownership governance capability, got %+v", aws.Governance)
	}
	if !aws.Governance[models.BucketGovernanceCapabilityVersioning].Enabled {
		t.Fatalf("expected aws versioning governance capability, got %+v", aws.Governance)
	}
	if !aws.Governance[models.BucketGovernanceCapabilityDefaultEncryption].Enabled {
		t.Fatalf("expected aws default encryption governance capability, got %+v", aws.Governance)
	}
	if !aws.Governance[models.BucketGovernanceCapabilityLifecycle].Enabled {
		t.Fatalf("expected aws lifecycle governance capability, got %+v", aws.Governance)
	}
	if s3.DirectUpload {
		t.Fatalf("expected directUpload=false in default test server config")
	}
	if s3.Reasons == nil || s3.Reasons.DirectUpload == "" {
		t.Fatalf("expected directUpload reason when direct upload is disabled, got %+v", s3.Reasons)
	}

	azure := meta.Capabilities.Providers[models.ProfileProviderAzureBlob]
	if !azure.AzureContainerAccessPolicy {
		t.Fatalf("expected azure container access policy capability, got %+v", azure)
	}
	if !azure.Governance[models.BucketGovernanceCapabilityAccessPublicToggle].Enabled {
		t.Fatalf("expected azure public toggle governance capability, got %+v", azure.Governance)
	}
	if !azure.Governance[models.BucketGovernanceCapabilityStoredAccessPolicy].Enabled {
		t.Fatalf("expected azure stored access policy governance capability, got %+v", azure.Governance)
	}
	if !azure.Governance[models.BucketGovernanceCapabilityVersioning].Enabled {
		t.Fatalf("expected azure versioning governance capability, got %+v", azure.Governance)
	}
	if !azure.Governance[models.BucketGovernanceCapabilitySoftDelete].Enabled {
		t.Fatalf("expected azure soft delete governance capability, got %+v", azure.Governance)
	}
	if azure.PresignedUpload {
		t.Fatalf("expected azure presignedUpload=false, got %+v", azure)
	}
	if azure.Reasons == nil || azure.Reasons.PresignedUpload == "" {
		t.Fatalf("expected azure presigned upload reason, got %+v", azure.Reasons)
	}

	gcs := meta.Capabilities.Providers[models.ProfileProviderGcpGcs]
	if !gcs.GCSIAMPolicy {
		t.Fatalf("expected gcp IAM policy capability, got %+v", gcs)
	}
	if !gcs.Governance[models.BucketGovernanceCapabilityAccessBindings].Enabled {
		t.Fatalf("expected gcp access bindings governance capability, got %+v", gcs.Governance)
	}
	if !gcs.Governance[models.BucketGovernanceCapabilityAccessPublicToggle].Enabled {
		t.Fatalf("expected gcp public toggle governance capability, got %+v", gcs.Governance)
	}
	if !gcs.Governance[models.BucketGovernanceCapabilityPublicAccessPrevention].Enabled {
		t.Fatalf("expected gcp public access prevention governance capability, got %+v", gcs.Governance)
	}
	if !gcs.Governance[models.BucketGovernanceCapabilityUniformAccess].Enabled {
		t.Fatalf("expected gcp uniform access governance capability, got %+v", gcs.Governance)
	}
	if !gcs.Governance[models.BucketGovernanceCapabilityVersioning].Enabled {
		t.Fatalf("expected gcp versioning governance capability, got %+v", gcs.Governance)
	}
	if !gcs.Governance[models.BucketGovernanceCapabilityRetention].Enabled {
		t.Fatalf("expected gcp retention governance capability, got %+v", gcs.Governance)
	}
	if gcs.BucketPolicy {
		t.Fatalf("expected gcp bucketPolicy=false, got %+v", gcs)
	}
	if gcs.Reasons == nil || gcs.Reasons.BucketPolicy == "" {
		t.Fatalf("expected gcp bucket policy reason, got %+v", gcs.Reasons)
	}

	oci := meta.Capabilities.Providers[models.ProfileProviderOciObjectStorage]
	if !oci.Governance[models.BucketGovernanceCapabilityAccessPublicToggle].Enabled {
		t.Fatalf("expected oci public toggle governance capability, got %+v", oci.Governance)
	}
	if !oci.Governance[models.BucketGovernanceCapabilityVersioning].Enabled {
		t.Fatalf("expected oci versioning governance capability, got %+v", oci.Governance)
	}
	if !oci.Governance[models.BucketGovernanceCapabilityRetention].Enabled {
		t.Fatalf("expected oci retention governance capability, got %+v", oci.Governance)
	}
	if !oci.Governance[models.BucketGovernanceCapabilityPAR].Enabled {
		t.Fatalf("expected oci PAR governance capability, got %+v", oci.Governance)
	}
}

func TestGetMetaPostgresAdvertisesPortableBackupOnly(t *testing.T) {
	t.Parallel()

	_, _, srv, _ := newTestJobsServerWithAdvertisedBackend(t, testEncryptionKey(), false, nil, db.BackendPostgres)

	res := doJSONRequest(t, srv, http.MethodGet, "/api/v1/meta", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	var meta models.MetaResponse
	decodeJSONResponse(t, res, &meta)

	if meta.DBBackend != "postgres" {
		t.Fatalf("expected dbBackend=postgres, got %q", meta.DBBackend)
	}
	if !meta.Capabilities.ServerBackup.Export.Enabled {
		t.Fatal("expected portable backup export enabled for postgres-backed servers")
	}
	if !strings.Contains(meta.Capabilities.ServerBackup.Export.Reason, "Portable backup export is available") {
		t.Fatalf("expected portable-only export reason, got %q", meta.Capabilities.ServerBackup.Export.Reason)
	}
	if !meta.Capabilities.ServerBackup.RestoreStaging.Enabled {
		t.Fatal("expected restore staging enabled for postgres-backed servers")
	}
	if !strings.Contains(meta.Capabilities.ServerBackup.RestoreStaging.Reason, "does not replace a Postgres backup or restore workflow") {
		t.Fatalf("expected postgres restore staging warning, got %q", meta.Capabilities.ServerBackup.RestoreStaging.Reason)
	}
}

func TestGetMetaIncludesOperationalWarnings(t *testing.T) {
	t.Parallel()

	_, srv := newTestServerWithConfig(t, config.Config{
		AllowRemote: true,
	})

	res := doJSONRequest(t, srv, http.MethodGet, "/api/v1/meta", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	var meta models.MetaResponse
	decodeJSONResponse(t, res, &meta)

	if len(meta.Warnings) != 2 {
		t.Fatalf("warnings=%v, want 2 warnings", meta.Warnings)
	}
	if meta.Warnings[0] != config.WarningRemoteWithoutAllowedLocalDirs {
		t.Fatalf("warnings[0]=%q, want %q", meta.Warnings[0], config.WarningRemoteWithoutAllowedLocalDirs)
	}
	if meta.Warnings[1] != config.WarningEncryptionKeyUnset {
		t.Fatalf("warnings[1]=%q, want %q", meta.Warnings[1], config.WarningEncryptionKeyUnset)
	}
}

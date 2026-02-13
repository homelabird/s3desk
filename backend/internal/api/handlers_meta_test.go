package api

import (
	"net/http"
	"testing"

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

	if len(meta.Capabilities.Providers) == 0 {
		t.Fatalf("expected provider capabilities in /meta response")
	}

	expectedProviders := []models.ProfileProvider{
		models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
		models.ProfileProviderOciS3Compat,
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
	if gcs.BucketPolicy {
		t.Fatalf("expected gcp bucketPolicy=false, got %+v", gcs)
	}
	if gcs.Reasons == nil || gcs.Reasons.BucketPolicy == "" {
		t.Fatalf("expected gcp bucket policy reason, got %+v", gcs.Reasons)
	}
}

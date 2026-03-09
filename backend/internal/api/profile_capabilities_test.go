package api

import (
	"testing"

	"s3desk/internal/models"
)

func TestDecorateProfileFlagsLegacyGCSForUpdate(t *testing.T) {
	t.Parallel()

	profile := decorateProfile(models.Profile{
		ID:       "p1",
		Name:     "legacy-gcs",
		Provider: models.ProfileProviderGcpGcs,
	}, false)

	if profile.Validation == nil {
		t.Fatal("expected validation details")
	}
	if profile.Validation.Valid {
		t.Fatalf("validation=%+v, want invalid", profile.Validation)
	}
	if len(profile.Validation.Issues) != 1 {
		t.Fatalf("issues=%d, want 1", len(profile.Validation.Issues))
	}
	issue := profile.Validation.Issues[0]
	if issue.Code != profileValidationIssueGcpProjectNumberRequired {
		t.Fatalf("issue code=%q, want %q", issue.Code, profileValidationIssueGcpProjectNumberRequired)
	}
	if issue.Field != "projectNumber" {
		t.Fatalf("issue field=%q, want projectNumber", issue.Field)
	}
	if profile.EffectiveCapabilities == nil {
		t.Fatal("expected effective capabilities")
	}
	if profile.EffectiveCapabilities.BucketCRUD {
		t.Fatalf("capabilities=%+v, want bucket CRUD disabled", profile.EffectiveCapabilities)
	}
	if profile.EffectiveCapabilities.Reasons == nil || profile.EffectiveCapabilities.Reasons.BucketCRUD == "" {
		t.Fatalf("capability reasons=%+v, want bucketCrud reason", profile.EffectiveCapabilities.Reasons)
	}
}

func TestDecorateProfileDisablesAnonymousGCSIAMWithoutEndpoint(t *testing.T) {
	t.Parallel()

	anonymous := true
	profile := decorateProfile(models.Profile{
		ID:            "p1",
		Name:          "anon-gcs",
		Provider:      models.ProfileProviderGcpGcs,
		Anonymous:     &anonymous,
		ProjectNumber: "123456789012",
	}, false)

	if profile.Validation != nil {
		t.Fatalf("validation=%+v, want omitted for valid profile", profile.Validation)
	}
	if profile.EffectiveCapabilities == nil {
		t.Fatal("expected effective capabilities")
	}
	if profile.EffectiveCapabilities.GCSIAMPolicy {
		t.Fatalf("capabilities=%+v, want GCS IAM disabled", profile.EffectiveCapabilities)
	}
	if profile.EffectiveCapabilities.Reasons == nil || profile.EffectiveCapabilities.Reasons.GCSIAMPolicy != reasonGcpAnonymousPolicyEndpoint {
		t.Fatalf("capability reasons=%+v, want %q", profile.EffectiveCapabilities.Reasons, reasonGcpAnonymousPolicyEndpoint)
	}
}

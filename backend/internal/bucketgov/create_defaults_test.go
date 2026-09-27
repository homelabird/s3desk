package bucketgov

import (
	"context"
	"encoding/json"
	"s3desk/internal/gcsiam"
	"testing"

	"s3desk/internal/models"
)

func TestValidateCreateDefaultsRejectsEmptyDefaults(t *testing.T) {
	t.Parallel()

	err := ValidateCreateDefaults(models.ProfileProviderAwsS3, &models.BucketCreateDefaults{})
	if err == nil {
		t.Fatal("expected validation error")
	}
	opErr, ok := err.(*OperationError)
	if !ok {
		t.Fatalf("err=%T, want *OperationError", err)
	}
	if opErr.Code != "invalid_request" {
		t.Fatalf("code=%q, want invalid_request", opErr.Code)
	}
	if got := opErr.Details["field"]; got != "defaults" {
		t.Fatalf("field=%v, want defaults", got)
	}
}

func TestValidateCreateDefaultsPrefixesNestedField(t *testing.T) {
	t.Parallel()

	err := ValidateCreateDefaults(models.ProfileProviderAzureBlob, &models.BucketCreateDefaults{
		Access: &models.BucketAccessPutRequest{
			ObjectOwnership: bucketObjectOwnershipPtr(models.BucketObjectOwnershipBucketOwnerEnforced),
		},
	})
	if err == nil {
		t.Fatal("expected validation error")
	}
	opErr, ok := err.(*OperationError)
	if !ok {
		t.Fatalf("err=%T, want *OperationError", err)
	}
	if got := opErr.Details["field"]; got != "defaults.access.objectOwnership" {
		t.Fatalf("field=%v, want defaults.access.objectOwnership", got)
	}
}

func TestApplyCreateDefaultsWrapsSection(t *testing.T) {
	t.Parallel()

	adapter := &stubCreateDefaultsAdapter{
		putVersioningErr: AccessDeniedError("demo", "PutBucketVersioning"),
	}
	registry := NewRegistry()
	registry.Register(models.ProfileProviderAwsS3, adapter)
	service := NewService(registry)

	err := ApplyCreateDefaults(context.Background(), service, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3}, "demo", &models.BucketCreateDefaults{
		Versioning: &models.BucketVersioningPutRequest{Status: models.BucketVersioningStatusEnabled},
	})
	if err == nil {
		t.Fatal("expected apply error")
	}
	applyErr, ok := err.(*CreateDefaultsApplyError)
	if !ok {
		t.Fatalf("err=%T, want *CreateDefaultsApplyError", err)
	}
	if applyErr.Section != "versioning" {
		t.Fatalf("section=%q, want versioning", applyErr.Section)
	}
}

type stubCreateDefaultsAdapter struct {
	putVersioningErr error
}

func (s *stubCreateDefaultsAdapter) GetGovernance(context.Context, models.ProfileSecrets, string) (models.BucketGovernanceView, error) {
	return models.BucketGovernanceView{}, nil
}

func (s *stubCreateDefaultsAdapter) GetAccess(context.Context, models.ProfileSecrets, string) (models.BucketAccessView, error) {
	return models.BucketAccessView{}, nil
}

func (s *stubCreateDefaultsAdapter) PutAccess(context.Context, models.ProfileSecrets, string, models.BucketAccessPutRequest) error {
	return nil
}

func (s *stubCreateDefaultsAdapter) GetPublicExposure(context.Context, models.ProfileSecrets, string) (models.BucketPublicExposureView, error) {
	return models.BucketPublicExposureView{}, nil
}

func (s *stubCreateDefaultsAdapter) PutPublicExposure(context.Context, models.ProfileSecrets, string, models.BucketPublicExposurePutRequest) error {
	return nil
}

func (s *stubCreateDefaultsAdapter) GetProtection(context.Context, models.ProfileSecrets, string) (models.BucketProtectionView, error) {
	return models.BucketProtectionView{}, nil
}

func (s *stubCreateDefaultsAdapter) PutProtection(context.Context, models.ProfileSecrets, string, models.BucketProtectionPutRequest) error {
	return nil
}

func (s *stubCreateDefaultsAdapter) GetVersioning(context.Context, models.ProfileSecrets, string) (models.BucketVersioningView, error) {
	return models.BucketVersioningView{}, nil
}

func (s *stubCreateDefaultsAdapter) PutVersioning(context.Context, models.ProfileSecrets, string, models.BucketVersioningPutRequest) error {
	return s.putVersioningErr
}

func (s *stubCreateDefaultsAdapter) GetEncryption(context.Context, models.ProfileSecrets, string) (models.BucketEncryptionView, error) {
	return models.BucketEncryptionView{}, nil
}

func (s *stubCreateDefaultsAdapter) PutEncryption(context.Context, models.ProfileSecrets, string, models.BucketEncryptionPutRequest) error {
	return nil
}

func (s *stubCreateDefaultsAdapter) GetLifecycle(context.Context, models.ProfileSecrets, string) (models.BucketLifecycleView, error) {
	return models.BucketLifecycleView{}, nil
}

func (s *stubCreateDefaultsAdapter) PutLifecycle(context.Context, models.ProfileSecrets, string, models.BucketLifecyclePutRequest) error {
	return nil
}

func (s *stubCreateDefaultsAdapter) GetSharing(context.Context, models.ProfileSecrets, string) (models.BucketSharingView, error) {
	return models.BucketSharingView{}, nil
}

func (s *stubCreateDefaultsAdapter) PutSharing(context.Context, models.ProfileSecrets, string, models.BucketSharingPutRequest) (models.BucketSharingView, error) {
	return models.BucketSharingView{}, nil
}

func bucketObjectOwnershipPtr(mode models.BucketObjectOwnershipMode) *models.BucketObjectOwnershipMode {
	return &mode
}

func TestGCSCreateDefaultsUsesInitialPolicyETag(t *testing.T) {
	for _, etag := range []string{"initial-revision", ""} {
		writes := 0
		adapter := &gcsAdapter{
			getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
				body, _ := json.Marshal(gcsIAMPolicy{Version: 1, ETag: etag})
				return gcsiam.Response{Status: 200, Body: body}, nil
			},
			putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, body []byte) (gcsiam.Response, error) {
				writes++
				var policy gcsIAMPolicy
				if err := json.Unmarshal(body, &policy); err != nil {
					t.Fatal(err)
				}
				if policy.ETag != "initial-revision" {
					t.Fatalf("etag=%q", policy.ETag)
				}
				return gcsiam.Response{Status: 200}, nil
			},
		}
		registry := NewRegistry()
		registry.Register(models.ProfileProviderGcpGcs, adapter)
		defaults := &models.BucketCreateDefaults{Access: &models.BucketAccessPutRequest{}}
		err := ApplyCreateDefaults(context.Background(), NewService(registry), models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs}, "demo", defaults)
		if (err != nil) != (etag == "") {
			t.Fatalf("etag=%q err=%v", etag, err)
		}
		if (writes == 1) != (etag != "") {
			t.Fatalf("etag=%q writes=%d", etag, writes)
		}
		if defaults.Access.ETag != "" {
			t.Fatal("caller defaults mutated")
		}
	}
}

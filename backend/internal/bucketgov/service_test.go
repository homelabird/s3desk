package bucketgov

import (
	"context"
	"errors"
	"testing"

	"s3desk/internal/models"
)

type stubAdapter struct {
	governance models.BucketGovernanceView
	access     models.BucketAccessView
	lifecycle  models.BucketLifecycleView
	bucketSeen string
	err        error
}

func (s *stubAdapter) GetGovernance(_ context.Context, _ models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	s.bucketSeen = bucket
	return s.governance, s.err
}

func (s *stubAdapter) GetAccess(_ context.Context, _ models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
	s.bucketSeen = bucket
	return s.access, s.err
}

func (s *stubAdapter) PutAccess(_ context.Context, _ models.ProfileSecrets, bucket string, _ models.BucketAccessPutRequest) error {
	s.bucketSeen = bucket
	return s.err
}

func (s *stubAdapter) GetPublicExposure(context.Context, models.ProfileSecrets, string) (models.BucketPublicExposureView, error) {
	return models.BucketPublicExposureView{}, s.err
}

func (s *stubAdapter) PutPublicExposure(context.Context, models.ProfileSecrets, string, models.BucketPublicExposurePutRequest) error {
	return s.err
}

func (s *stubAdapter) GetProtection(context.Context, models.ProfileSecrets, string) (models.BucketProtectionView, error) {
	return models.BucketProtectionView{}, s.err
}

func (s *stubAdapter) PutProtection(context.Context, models.ProfileSecrets, string, models.BucketProtectionPutRequest) error {
	return s.err
}

func (s *stubAdapter) GetVersioning(context.Context, models.ProfileSecrets, string) (models.BucketVersioningView, error) {
	return models.BucketVersioningView{}, s.err
}

func (s *stubAdapter) PutVersioning(context.Context, models.ProfileSecrets, string, models.BucketVersioningPutRequest) error {
	return s.err
}

func (s *stubAdapter) GetEncryption(context.Context, models.ProfileSecrets, string) (models.BucketEncryptionView, error) {
	return models.BucketEncryptionView{}, s.err
}

func (s *stubAdapter) PutEncryption(context.Context, models.ProfileSecrets, string, models.BucketEncryptionPutRequest) error {
	return s.err
}

func (s *stubAdapter) GetLifecycle(_ context.Context, _ models.ProfileSecrets, bucket string) (models.BucketLifecycleView, error) {
	s.bucketSeen = bucket
	return s.lifecycle, s.err
}

func (s *stubAdapter) PutLifecycle(_ context.Context, _ models.ProfileSecrets, bucket string, _ models.BucketLifecyclePutRequest) error {
	s.bucketSeen = bucket
	return s.err
}

func (s *stubAdapter) GetSharing(_ context.Context, _ models.ProfileSecrets, bucket string) (models.BucketSharingView, error) {
	s.bucketSeen = bucket
	return models.BucketSharingView{}, s.err
}

func (s *stubAdapter) PutSharing(_ context.Context, _ models.ProfileSecrets, bucket string, _ models.BucketSharingPutRequest) (models.BucketSharingView, error) {
	s.bucketSeen = bucket
	return models.BucketSharingView{}, s.err
}

func TestRegistryRegisterAndResolve(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()
	adapter := &stubAdapter{}
	registry.Register(models.ProfileProviderAwsS3, adapter)

	got, err := registry.Resolve(models.ProfileProviderAwsS3)
	if err != nil {
		t.Fatalf("resolve err=%v", err)
	}
	if got != adapter {
		t.Fatalf("adapter=%p, want %p", got, adapter)
	}
}

func TestRegistryResolveReturnsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()

	_, err := registry.Resolve(models.ProfileProviderAwsS3)
	if err == nil {
		t.Fatal("expected unsupported provider error")
	}
	var unsupported UnsupportedProviderError
	if !errors.As(err, &unsupported) {
		t.Fatalf("err=%T, want UnsupportedProviderError", err)
	}
}

func TestServiceDelegatesToRegisteredAdapter(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()
	adapter := &stubAdapter{
		governance: models.BucketGovernanceView{
			Provider: models.ProfileProviderAwsS3,
			Bucket:   "demo",
		},
	}
	registry.Register(models.ProfileProviderAwsS3, adapter)
	service := NewService(registry)

	got, err := service.GetGovernance(context.Background(), models.ProfileSecrets{
		Provider: models.ProfileProviderAwsS3,
	}, " demo ")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if got.Provider != models.ProfileProviderAwsS3 {
		t.Fatalf("provider=%q, want %q", got.Provider, models.ProfileProviderAwsS3)
	}
	if adapter.bucketSeen != "demo" {
		t.Fatalf("bucket=%q, want demo", adapter.bucketSeen)
	}
}

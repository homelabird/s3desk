package bucketgov

import (
	"context"
	"strings"

	"s3desk/internal/models"
)

type Service struct {
	registry *Registry
}

func NewService(registry *Registry) *Service {
	if registry == nil {
		registry = NewRegistry()
	}
	return &Service{registry: registry}
}

func (s *Service) Registry() *Registry {
	if s == nil {
		return nil
	}
	return s.registry
}

func (s *Service) GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	return serviceGet[governanceSection](s, ctx, profile, bucket, func(adapter governanceSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
		return adapter.GetGovernance(ctx, profile, bucket)
	})
}

func (s *Service) GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
	return serviceGet[accessSection](s, ctx, profile, bucket, func(adapter accessSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
		return adapter.GetAccess(ctx, profile, bucket)
	})
}

func (s *Service) PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error {
	return servicePut[accessSection](s, ctx, profile, bucket, req, ValidateAccessPut, func(adapter accessSection, ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error {
		return adapter.PutAccess(ctx, profile, bucket, req)
	})
}

func (s *Service) GetPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error) {
	return serviceGet[publicExposureSection](s, ctx, profile, bucket, func(adapter publicExposureSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error) {
		return adapter.GetPublicExposure(ctx, profile, bucket)
	})
}

func (s *Service) PutPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error {
	return servicePut[publicExposureSection](s, ctx, profile, bucket, req, ValidatePublicExposurePut, func(adapter publicExposureSection, ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error {
		return adapter.PutPublicExposure(ctx, profile, bucket, req)
	})
}

func (s *Service) GetProtection(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketProtectionView, error) {
	return serviceGet[protectionSection](s, ctx, profile, bucket, func(adapter protectionSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketProtectionView, error) {
		return adapter.GetProtection(ctx, profile, bucket)
	})
}

func (s *Service) PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) error {
	return servicePut[protectionSection](s, ctx, profile, bucket, req, ValidateProtectionPut, func(adapter protectionSection, ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) error {
		return adapter.PutProtection(ctx, profile, bucket, req)
	})
}

func (s *Service) GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
	return serviceGet[versioningSection](s, ctx, profile, bucket, func(adapter versioningSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
		return adapter.GetVersioning(ctx, profile, bucket)
	})
}

func (s *Service) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	return servicePut[versioningSection](s, ctx, profile, bucket, req, ValidateVersioningPut, func(adapter versioningSection, ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
		return adapter.PutVersioning(ctx, profile, bucket, req)
	})
}

func (s *Service) GetEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketEncryptionView, error) {
	return serviceGet[encryptionSection](s, ctx, profile, bucket, func(adapter encryptionSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketEncryptionView, error) {
		return adapter.GetEncryption(ctx, profile, bucket)
	})
}

func (s *Service) PutEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketEncryptionPutRequest) error {
	return servicePut[encryptionSection](s, ctx, profile, bucket, req, ValidateEncryptionPut, func(adapter encryptionSection, ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketEncryptionPutRequest) error {
		return adapter.PutEncryption(ctx, profile, bucket, req)
	})
}

func (s *Service) GetLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketLifecycleView, error) {
	return serviceGet[lifecycleSection](s, ctx, profile, bucket, func(adapter lifecycleSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketLifecycleView, error) {
		return adapter.GetLifecycle(ctx, profile, bucket)
	})
}

func (s *Service) PutLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketLifecyclePutRequest) error {
	return servicePut[lifecycleSection](s, ctx, profile, bucket, req, ValidateLifecyclePut, func(adapter lifecycleSection, ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketLifecyclePutRequest) error {
		return adapter.PutLifecycle(ctx, profile, bucket, req)
	})
}

func (s *Service) GetSharing(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketSharingView, error) {
	return serviceGet[sharingSection](s, ctx, profile, bucket, func(adapter sharingSection, ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketSharingView, error) {
		return adapter.GetSharing(ctx, profile, bucket)
	})
}

func (s *Service) PutSharing(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketSharingPutRequest) (models.BucketSharingView, error) {
	return servicePutAndReturn[sharingSection](s, ctx, profile, bucket, req, ValidateSharingPut, func(adapter sharingSection, ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketSharingPutRequest) (models.BucketSharingView, error) {
		return adapter.PutSharing(ctx, profile, bucket, req)
	})
}

func (s *Service) resolve(profile models.ProfileSecrets, bucket string) (Adapter, string, error) {
	if s == nil || s.registry == nil {
		return nil, "", UnsupportedProviderError{Provider: profile.Provider}
	}
	adapter, err := s.registry.Resolve(profile.Provider)
	if err != nil {
		return nil, "", err
	}
	return adapter, strings.TrimSpace(bucket), nil
}

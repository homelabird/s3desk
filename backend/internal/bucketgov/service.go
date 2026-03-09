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
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	return adapter.GetGovernance(ctx, profile, bucket)
}

func (s *Service) GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return models.BucketAccessView{}, err
	}
	return adapter.GetAccess(ctx, profile, bucket)
}

func (s *Service) PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return err
	}
	return adapter.PutAccess(ctx, profile, bucket, req)
}

func (s *Service) GetPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error) {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return models.BucketPublicExposureView{}, err
	}
	return adapter.GetPublicExposure(ctx, profile, bucket)
}

func (s *Service) PutPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return err
	}
	return adapter.PutPublicExposure(ctx, profile, bucket, req)
}

func (s *Service) GetProtection(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketProtectionView, error) {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return models.BucketProtectionView{}, err
	}
	return adapter.GetProtection(ctx, profile, bucket)
}

func (s *Service) PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) error {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return err
	}
	return adapter.PutProtection(ctx, profile, bucket, req)
}

func (s *Service) GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return models.BucketVersioningView{}, err
	}
	return adapter.GetVersioning(ctx, profile, bucket)
}

func (s *Service) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return err
	}
	return adapter.PutVersioning(ctx, profile, bucket, req)
}

func (s *Service) GetEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketEncryptionView, error) {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return models.BucketEncryptionView{}, err
	}
	return adapter.GetEncryption(ctx, profile, bucket)
}

func (s *Service) PutEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketEncryptionPutRequest) error {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return err
	}
	return adapter.PutEncryption(ctx, profile, bucket, req)
}

func (s *Service) GetLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketLifecycleView, error) {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return models.BucketLifecycleView{}, err
	}
	return adapter.GetLifecycle(ctx, profile, bucket)
}

func (s *Service) PutLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketLifecyclePutRequest) error {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return err
	}
	return adapter.PutLifecycle(ctx, profile, bucket, req)
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

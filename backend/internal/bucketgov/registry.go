package bucketgov

import (
	"context"
	"fmt"
	"strings"

	"s3desk/internal/models"
)

type Adapter interface {
	GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error)
	GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error)
	PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error
	GetPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error)
	PutPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error
	GetProtection(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketProtectionView, error)
	PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) error
	GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error)
	PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error
	GetEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketEncryptionView, error)
	PutEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketEncryptionPutRequest) error
	GetLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketLifecycleView, error)
	PutLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketLifecyclePutRequest) error
}

type UnsupportedProviderError struct {
	Provider models.ProfileProvider
}

func (e UnsupportedProviderError) Error() string {
	provider := strings.TrimSpace(string(e.Provider))
	if provider == "" {
		provider = "unknown"
	}
	return fmt.Sprintf("bucket governance is not registered for provider %q", provider)
}

type Registry struct {
	adapters map[models.ProfileProvider]Adapter
}

func NewRegistry() *Registry {
	return &Registry{
		adapters: make(map[models.ProfileProvider]Adapter),
	}
}

func (r *Registry) Register(provider models.ProfileProvider, adapter Adapter) {
	if r == nil || adapter == nil {
		return
	}
	if r.adapters == nil {
		r.adapters = make(map[models.ProfileProvider]Adapter)
	}
	r.adapters[provider] = adapter
}

func (r *Registry) Resolve(provider models.ProfileProvider) (Adapter, error) {
	if r == nil || r.adapters == nil {
		return nil, UnsupportedProviderError{Provider: provider}
	}
	adapter, ok := r.adapters[provider]
	if !ok || adapter == nil {
		return nil, UnsupportedProviderError{Provider: provider}
	}
	return adapter, nil
}

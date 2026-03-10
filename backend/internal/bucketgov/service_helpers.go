package bucketgov

import (
	"context"

	"s3desk/internal/models"
)

type governanceSection interface {
	GetGovernance(context.Context, models.ProfileSecrets, string) (models.BucketGovernanceView, error)
}

type accessSection interface {
	GetAccess(context.Context, models.ProfileSecrets, string) (models.BucketAccessView, error)
	PutAccess(context.Context, models.ProfileSecrets, string, models.BucketAccessPutRequest) error
}

type publicExposureSection interface {
	GetPublicExposure(context.Context, models.ProfileSecrets, string) (models.BucketPublicExposureView, error)
	PutPublicExposure(context.Context, models.ProfileSecrets, string, models.BucketPublicExposurePutRequest) error
}

type protectionSection interface {
	GetProtection(context.Context, models.ProfileSecrets, string) (models.BucketProtectionView, error)
	PutProtection(context.Context, models.ProfileSecrets, string, models.BucketProtectionPutRequest) error
}

type versioningSection interface {
	GetVersioning(context.Context, models.ProfileSecrets, string) (models.BucketVersioningView, error)
	PutVersioning(context.Context, models.ProfileSecrets, string, models.BucketVersioningPutRequest) error
}

type encryptionSection interface {
	GetEncryption(context.Context, models.ProfileSecrets, string) (models.BucketEncryptionView, error)
	PutEncryption(context.Context, models.ProfileSecrets, string, models.BucketEncryptionPutRequest) error
}

type lifecycleSection interface {
	GetLifecycle(context.Context, models.ProfileSecrets, string) (models.BucketLifecycleView, error)
	PutLifecycle(context.Context, models.ProfileSecrets, string, models.BucketLifecyclePutRequest) error
}

type sharingSection interface {
	GetSharing(context.Context, models.ProfileSecrets, string) (models.BucketSharingView, error)
	PutSharing(context.Context, models.ProfileSecrets, string, models.BucketSharingPutRequest) (models.BucketSharingView, error)
}

type sectionGetter[A any, T any] func(A, context.Context, models.ProfileSecrets, string) (T, error)
type sectionPut[A any, T any] func(A, context.Context, models.ProfileSecrets, string, T) error
type sectionPutResult[A any, TReq any, TResp any] func(A, context.Context, models.ProfileSecrets, string, TReq) (TResp, error)
type sectionValidator[T any] func(ValidationContext, T) error

func resolveSectionAdapter[A any](s *Service, profile models.ProfileSecrets, bucket string) (A, string, error) {
	var zero A
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return zero, "", err
	}
	section, ok := any(adapter).(A)
	if !ok {
		return zero, "", UnsupportedProviderError{Provider: profile.Provider}
	}
	return section, bucket, nil
}

func serviceGet[A any, T any](s *Service, ctx context.Context, profile models.ProfileSecrets, bucket string, getter sectionGetter[A, T]) (T, error) {
	var zero T
	adapter, bucket, err := resolveSectionAdapter[A](s, profile, bucket)
	if err != nil {
		return zero, err
	}
	return getter(adapter, ctx, profile, bucket)
}

func servicePut[A any, T any](s *Service, ctx context.Context, profile models.ProfileSecrets, bucket string, req T, validate sectionValidator[T], put sectionPut[A, T]) error {
	adapter, bucket, err := resolveSectionAdapter[A](s, profile, bucket)
	if err != nil {
		return err
	}
	if validate != nil {
		if err := validate(newValidationContext(profile.Provider, bucket), req); err != nil {
			return err
		}
	}
	return put(adapter, ctx, profile, bucket, req)
}

func servicePutAndReturn[A any, TReq any, TResp any](s *Service, ctx context.Context, profile models.ProfileSecrets, bucket string, req TReq, validate sectionValidator[TReq], put sectionPutResult[A, TReq, TResp]) (TResp, error) {
	var zero TResp
	adapter, bucket, err := resolveSectionAdapter[A](s, profile, bucket)
	if err != nil {
		return zero, err
	}
	if validate != nil {
		if err := validate(newValidationContext(profile.Provider, bucket), req); err != nil {
			return zero, err
		}
	}
	return put(adapter, ctx, profile, bucket, req)
}

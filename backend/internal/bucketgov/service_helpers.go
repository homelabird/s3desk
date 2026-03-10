package bucketgov

import (
	"context"

	"s3desk/internal/models"
)

type sectionGetter[T any] func(Adapter, context.Context, models.ProfileSecrets, string) (T, error)
type sectionPut[T any] func(Adapter, context.Context, models.ProfileSecrets, string, T) error
type sectionPutResult[TReq any, TResp any] func(Adapter, context.Context, models.ProfileSecrets, string, TReq) (TResp, error)
type sectionValidator[T any] func(models.ProfileProvider, T) error

func serviceGet[T any](s *Service, ctx context.Context, profile models.ProfileSecrets, bucket string, getter sectionGetter[T]) (T, error) {
	var zero T
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return zero, err
	}
	return getter(adapter, ctx, profile, bucket)
}

func servicePut[T any](s *Service, ctx context.Context, profile models.ProfileSecrets, bucket string, req T, validate sectionValidator[T], put sectionPut[T]) error {
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return err
	}
	if validate != nil {
		if err := validate(profile.Provider, req); err != nil {
			return err
		}
	}
	return put(adapter, ctx, profile, bucket, req)
}

func servicePutAndReturn[TReq any, TResp any](s *Service, ctx context.Context, profile models.ProfileSecrets, bucket string, req TReq, validate sectionValidator[TReq], put sectionPutResult[TReq, TResp]) (TResp, error) {
	var zero TResp
	adapter, bucket, err := s.resolve(profile, bucket)
	if err != nil {
		return zero, err
	}
	if validate != nil {
		if err := validate(profile.Provider, req); err != nil {
			return zero, err
		}
	}
	return put(adapter, ctx, profile, bucket, req)
}

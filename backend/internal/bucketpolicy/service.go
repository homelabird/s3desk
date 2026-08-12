package bucketpolicy

import (
	"context"
	"fmt"
	"net/http"

	"s3desk/internal/azureacl"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
	"s3desk/internal/s3policy"
)

// Response is the provider-neutral HTTP result used by the API response mapper.
type Response struct {
	Status  int
	Headers http.Header
	Body    []byte
}

type UnsupportedProviderError struct {
	Provider  models.ProfileProvider
	Operation string
}

func (e *UnsupportedProviderError) Error() string {
	if e == nil {
		return "bucket policy provider is unsupported"
	}
	return fmt.Sprintf("bucket policy is not supported for provider %q", e.Provider)
}

type Service struct {
	allowRemote bool
}

func NewService(allowRemote bool) *Service {
	return &Service{allowRemote: allowRemote}
}

func (s *Service) Get(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	allowRemote := s != nil && s.allowRemote
	switch profile.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		resp, err := s3policy.GetBucketPolicyWithOptions(ctx, profile, bucket, s3policy.ClientOptions{AllowRemote: allowRemote})
		return normalizeS3(resp), err
	case models.ProfileProviderGcpGcs:
		resp, err := gcsiam.GetBucketIamPolicyWithOptions(ctx, profile, bucket, gcsiam.ClientOptions{AllowRemote: allowRemote})
		return normalizeGCS(resp), err
	case models.ProfileProviderAzureBlob:
		resp, err := azureacl.GetContainerPolicyWithOptions(ctx, profile, bucket, azureacl.ClientOptions{AllowRemote: allowRemote})
		return normalizeAzure(resp), err
	default:
		return Response{}, &UnsupportedProviderError{Provider: profile.Provider}
	}
}

func (s *Service) Put(ctx context.Context, profile models.ProfileSecrets, bucket string, policy []byte) (Response, error) {
	allowRemote := s != nil && s.allowRemote
	switch profile.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		resp, err := s3policy.PutBucketPolicyWithOptions(ctx, profile, bucket, policy, s3policy.ClientOptions{AllowRemote: allowRemote})
		return normalizeS3(resp), err
	case models.ProfileProviderGcpGcs:
		resp, err := gcsiam.PutBucketIamPolicyWithOptions(ctx, profile, bucket, policy, gcsiam.ClientOptions{AllowRemote: allowRemote})
		return normalizeGCS(resp), err
	case models.ProfileProviderAzureBlob:
		resp, err := azureacl.PutContainerPolicyWithOptions(ctx, profile, bucket, policy, azureacl.ClientOptions{AllowRemote: allowRemote})
		return normalizeAzure(resp), err
	default:
		return Response{}, &UnsupportedProviderError{Provider: profile.Provider}
	}
}

func (s *Service) Delete(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	allowRemote := s != nil && s.allowRemote
	switch profile.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		resp, err := s3policy.DeleteBucketPolicyWithOptions(ctx, profile, bucket, s3policy.ClientOptions{AllowRemote: allowRemote})
		return normalizeS3(resp), err
	case models.ProfileProviderAzureBlob:
		resp, err := azureacl.DeleteContainerPolicyWithOptions(ctx, profile, bucket, azureacl.ClientOptions{AllowRemote: allowRemote})
		return normalizeAzure(resp), err
	case models.ProfileProviderGcpGcs:
		return Response{}, &UnsupportedProviderError{Provider: profile.Provider, Operation: "delete"}
	default:
		return Response{}, &UnsupportedProviderError{Provider: profile.Provider}
	}
}

func normalizeGCS(resp gcsiam.Response) Response {
	return Response{Status: resp.Status, Headers: resp.Headers, Body: resp.Body}
}

func normalizeS3(resp s3policy.Response) Response {
	return Response{Status: resp.Status, Headers: resp.Headers, Body: resp.Body}
}

func normalizeAzure(resp azureacl.Response) Response {
	return Response{Status: resp.Status, Headers: resp.Headers, Body: resp.Body}
}

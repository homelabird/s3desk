package bucketgov

import (
	"context"
	"errors"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"

	"s3desk/internal/models"
	"s3desk/internal/s3client"
)

type awsPublicAccessBlockClient interface {
	GetPublicAccessBlock(ctx context.Context, params *s3.GetPublicAccessBlockInput, optFns ...func(*s3.Options)) (*s3.GetPublicAccessBlockOutput, error)
	PutPublicAccessBlock(ctx context.Context, params *s3.PutPublicAccessBlockInput, optFns ...func(*s3.Options)) (*s3.PutPublicAccessBlockOutput, error)
	GetBucketOwnershipControls(ctx context.Context, params *s3.GetBucketOwnershipControlsInput, optFns ...func(*s3.Options)) (*s3.GetBucketOwnershipControlsOutput, error)
	PutBucketOwnershipControls(ctx context.Context, params *s3.PutBucketOwnershipControlsInput, optFns ...func(*s3.Options)) (*s3.PutBucketOwnershipControlsOutput, error)
	GetBucketVersioning(ctx context.Context, params *s3.GetBucketVersioningInput, optFns ...func(*s3.Options)) (*s3.GetBucketVersioningOutput, error)
	PutBucketVersioning(ctx context.Context, params *s3.PutBucketVersioningInput, optFns ...func(*s3.Options)) (*s3.PutBucketVersioningOutput, error)
	GetBucketEncryption(ctx context.Context, params *s3.GetBucketEncryptionInput, optFns ...func(*s3.Options)) (*s3.GetBucketEncryptionOutput, error)
	PutBucketEncryption(ctx context.Context, params *s3.PutBucketEncryptionInput, optFns ...func(*s3.Options)) (*s3.PutBucketEncryptionOutput, error)
	GetBucketLifecycleConfiguration(ctx context.Context, params *s3.GetBucketLifecycleConfigurationInput, optFns ...func(*s3.Options)) (*s3.GetBucketLifecycleConfigurationOutput, error)
	PutBucketLifecycleConfiguration(ctx context.Context, params *s3.PutBucketLifecycleConfigurationInput, optFns ...func(*s3.Options)) (*s3.PutBucketLifecycleConfigurationOutput, error)
	DeleteBucketLifecycle(ctx context.Context, params *s3.DeleteBucketLifecycleInput, optFns ...func(*s3.Options)) (*s3.DeleteBucketLifecycleOutput, error)
}

type awsAdapter struct {
	newClient func(models.ProfileSecrets) awsPublicAccessBlockClient
}

func NewDefaultRegistry() *Registry {
	registry := NewRegistry()
	registry.Register(models.ProfileProviderAwsS3, NewAWSAdapter())
	registry.Register(models.ProfileProviderGcpGcs, NewGCSAdapter())
	registry.Register(models.ProfileProviderAzureBlob, NewAzureAdapter())
	registry.Register(models.ProfileProviderOciObjectStorage, NewOCIAdapter())
	return registry
}

func NewAWSAdapter() Adapter {
	return &awsAdapter{
		newClient: func(secrets models.ProfileSecrets) awsPublicAccessBlockClient {
			return s3client.FromProfile(secrets)
		},
	}
}

func (a *awsAdapter) GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	view := NewView(models.ProfileProviderAwsS3, bucket)
	view.Capabilities = ProviderGovernanceCapabilities(models.ProfileProviderAwsS3)

	access, err := a.GetAccess(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Access = &access

	publicExposure, err := a.GetPublicExposure(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.PublicExposure = &publicExposure

	versioning, err := a.GetVersioning(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Versioning = &versioning

	encryption, err := a.GetEncryption(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Encryption = &encryption

	lifecycle, err := a.GetLifecycle(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Lifecycle = &lifecycle

	if rawPolicy := view.Capabilities[models.BucketGovernanceCapabilityAccessRawPolicy]; rawPolicy.Enabled {
		view.Advanced = &models.BucketAdvancedView{
			RawPolicySupported: true,
			RawPolicyEditable:  true,
		}
	}

	return view, nil
}

func (a *awsAdapter) GetPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error) {
	client := a.newClient(profile)
	out, err := client.GetPublicAccessBlock(ctx, &s3.GetPublicAccessBlockInput{
		Bucket: &bucket,
	})
	if err != nil {
		if isAWSAPICode(err, "NoSuchPublicAccessBlockConfiguration") {
			block := models.BucketBlockPublicAccess{}
			view := newAWSPublicExposureView(bucket, block)
			view.Warnings = append(view.Warnings, "S3 Block Public Access is not configured on this bucket.")
			return view, nil
		}
		return models.BucketPublicExposureView{}, mapAWSPublicExposureError(err, bucket, "get")
	}

	block := models.BucketBlockPublicAccess{}
	if out.PublicAccessBlockConfiguration != nil {
		block = fromS3PublicAccessBlock(*out.PublicAccessBlockConfiguration)
	}
	view := newAWSPublicExposureView(bucket, block)
	if !allPublicAccessBlockEnabled(block) {
		view.Warnings = append(view.Warnings, "One or more S3 Block Public Access protections are disabled.")
	}
	return view, nil
}

func (a *awsAdapter) PutPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error {
	if err := ValidatePublicExposurePut(models.ProfileProviderAwsS3, req); err != nil {
		return err
	}

	block, err := normalizePublicExposurePut(req)
	if err != nil {
		return err
	}

	client := a.newClient(profile)
	_, putErr := client.PutPublicAccessBlock(ctx, &s3.PutPublicAccessBlockInput{
		Bucket: &bucket,
		PublicAccessBlockConfiguration: &s3types.PublicAccessBlockConfiguration{
			BlockPublicAcls:       boolPtr(block.BlockPublicAcls),
			IgnorePublicAcls:      boolPtr(block.IgnorePublicAcls),
			BlockPublicPolicy:     boolPtr(block.BlockPublicPolicy),
			RestrictPublicBuckets: boolPtr(block.RestrictPublicBuckets),
		},
	})
	if putErr != nil {
		return mapAWSPublicExposureError(putErr, bucket, "put")
	}
	return nil
}

func newAWSPublicExposureView(bucket string, block models.BucketBlockPublicAccess) models.BucketPublicExposureView {
	view := models.BucketPublicExposureView{
		Provider:          models.ProfileProviderAwsS3,
		Bucket:            strings.TrimSpace(bucket),
		Mode:              models.BucketPublicExposureModePublic,
		BlockPublicAccess: &block,
	}
	if allPublicAccessBlockEnabled(block) {
		view.Mode = models.BucketPublicExposureModePrivate
	}
	return view
}

func fromS3PublicAccessBlock(in s3types.PublicAccessBlockConfiguration) models.BucketBlockPublicAccess {
	return models.BucketBlockPublicAccess{
		BlockPublicAcls:       derefBool(in.BlockPublicAcls),
		IgnorePublicAcls:      derefBool(in.IgnorePublicAcls),
		BlockPublicPolicy:     derefBool(in.BlockPublicPolicy),
		RestrictPublicBuckets: derefBool(in.RestrictPublicBuckets),
	}
}

func allPublicAccessBlockEnabled(block models.BucketBlockPublicAccess) bool {
	return block.BlockPublicAcls && block.IgnorePublicAcls && block.BlockPublicPolicy && block.RestrictPublicBuckets
}

func normalizePublicExposurePut(req models.BucketPublicExposurePutRequest) (models.BucketBlockPublicAccess, error) {
	if req.BlockPublicAccess != nil {
		return *req.BlockPublicAccess, nil
	}
	switch req.Mode {
	case models.BucketPublicExposureModePrivate:
		return models.BucketBlockPublicAccess{
			BlockPublicAcls:       true,
			IgnorePublicAcls:      true,
			BlockPublicPolicy:     true,
			RestrictPublicBuckets: true,
		}, nil
	case models.BucketPublicExposureModePublic:
		return models.BucketBlockPublicAccess{}, nil
	default:
		return models.BucketBlockPublicAccess{}, InvalidFieldError("blockPublicAccess", "blockPublicAccess is required", nil)
	}
}

func mapAWSPublicExposureError(err error, bucket string, op string) error {
	if err == nil {
		return nil
	}
	if isAWSAPICode(err, "NoSuchBucket") {
		return BucketNotFoundError(bucket)
	}
	if isAWSAPICode(err, "AccessDenied") {
		return AccessDeniedError(bucket, op)
	}
	return UpstreamOperationError("bucket_public_exposure_error", "failed to "+op+" bucket public exposure", bucket, err)
}

func isAWSAPICode(err error, code string) bool {
	if err == nil || strings.TrimSpace(code) == "" {
		return false
	}
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(apiErr.ErrorCode()), strings.TrimSpace(code))
}

func boolPtr(value bool) *bool {
	return &value
}

func derefBool(value *bool) bool {
	if value == nil {
		return false
	}
	return *value
}

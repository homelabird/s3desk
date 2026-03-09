package bucketgov

import (
	"context"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
)

func (a *awsAdapter) GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
	client := a.newClient(profile)
	out, err := client.GetBucketVersioning(ctx, &s3.GetBucketVersioningInput{
		Bucket: &bucket,
	})
	if err != nil {
		return models.BucketVersioningView{}, mapAWSVersioningError(err, bucket, "get")
	}

	view := models.BucketVersioningView{
		Provider: models.ProfileProviderAwsS3,
		Bucket:   strings.TrimSpace(bucket),
		Status:   fromS3VersioningStatus(out.Status),
	}
	if out.MFADelete == s3types.MFADeleteStatusEnabled {
		view.Warnings = append(view.Warnings, "MFA Delete is enabled and cannot be managed by this client.")
	}
	return view, nil
}

func (a *awsAdapter) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	if err := ValidateVersioningPut(models.ProfileProviderAwsS3, req); err != nil {
		return err
	}

	status, err := toS3VersioningStatus(req.Status)
	if err != nil {
		return err
	}

	client := a.newClient(profile)
	_, putErr := client.PutBucketVersioning(ctx, &s3.PutBucketVersioningInput{
		Bucket: &bucket,
		VersioningConfiguration: &s3types.VersioningConfiguration{
			Status: status,
		},
	})
	if putErr != nil {
		return mapAWSVersioningError(putErr, bucket, "put")
	}
	return nil
}

func fromS3VersioningStatus(status s3types.BucketVersioningStatus) models.BucketVersioningStatus {
	switch status {
	case s3types.BucketVersioningStatusEnabled:
		return models.BucketVersioningStatusEnabled
	case s3types.BucketVersioningStatusSuspended:
		return models.BucketVersioningStatusSuspended
	default:
		return models.BucketVersioningStatusDisabled
	}
}

func toS3VersioningStatus(status models.BucketVersioningStatus) (s3types.BucketVersioningStatus, error) {
	switch status {
	case models.BucketVersioningStatusEnabled:
		return s3types.BucketVersioningStatusEnabled, nil
	case models.BucketVersioningStatusSuspended:
		return s3types.BucketVersioningStatusSuspended, nil
	default:
		return "", InvalidEnumFieldError("status", string(status),
			string(models.BucketVersioningStatusEnabled),
			string(models.BucketVersioningStatusSuspended),
		)
	}
}

func mapAWSVersioningError(err error, bucket string, op string) error {
	if err == nil {
		return nil
	}
	if isAWSAPICode(err, "NoSuchBucket") {
		return BucketNotFoundError(bucket)
	}
	if isAWSAPICode(err, "AccessDenied") {
		return AccessDeniedError(bucket, op)
	}
	return UpstreamOperationError("bucket_versioning_error", "failed to "+op+" bucket versioning", bucket, err)
}

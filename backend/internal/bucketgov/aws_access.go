package bucketgov

import (
	"context"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
)

func (a *awsAdapter) GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
	client := a.newClient(profile)
	out, err := client.GetBucketOwnershipControls(ctx, &s3.GetBucketOwnershipControlsInput{
		Bucket: &bucket,
	})
	if err != nil {
		if isAWSAPICode(err, "OwnershipControlsNotFoundError") {
			return newAWSAccessView(bucket, models.BucketObjectOwnershipBucketOwnerEnforced), nil
		}
		return models.BucketAccessView{}, mapAWSAccessError(err, bucket, "get")
	}

	mode := models.BucketObjectOwnershipBucketOwnerEnforced
	if out != nil && out.OwnershipControls != nil && len(out.OwnershipControls.Rules) > 0 {
		mode = fromS3ObjectOwnership(out.OwnershipControls.Rules[0].ObjectOwnership)
	}
	return newAWSAccessView(bucket, mode), nil
}

func (a *awsAdapter) PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error {
	client := a.newClient(profile)
	_, err := client.PutBucketOwnershipControls(ctx, &s3.PutBucketOwnershipControlsInput{
		Bucket: &bucket,
		OwnershipControls: &s3types.OwnershipControls{
			Rules: []s3types.OwnershipControlsRule{
				{ObjectOwnership: toS3ObjectOwnership(*req.ObjectOwnership)},
			},
		},
	})
	if err != nil {
		return mapAWSAccessError(err, bucket, "put")
	}
	return nil
}

func newAWSAccessView(bucket string, mode models.BucketObjectOwnershipMode) models.BucketAccessView {
	return models.BucketAccessView{
		Provider: models.ProfileProviderAwsS3,
		Bucket:   strings.TrimSpace(bucket),
		ObjectOwnership: &models.BucketObjectOwnershipView{
			Supported: true,
			Mode:      mode,
		},
		Advanced: &models.BucketAdvancedView{
			RawPolicySupported: true,
			RawPolicyEditable:  true,
		},
	}
}

func fromS3ObjectOwnership(value s3types.ObjectOwnership) models.BucketObjectOwnershipMode {
	switch value {
	case s3types.ObjectOwnershipBucketOwnerPreferred:
		return models.BucketObjectOwnershipBucketOwnerPreferred
	case s3types.ObjectOwnershipObjectWriter:
		return models.BucketObjectOwnershipObjectWriter
	default:
		return models.BucketObjectOwnershipBucketOwnerEnforced
	}
}

func toS3ObjectOwnership(value models.BucketObjectOwnershipMode) s3types.ObjectOwnership {
	switch value {
	case models.BucketObjectOwnershipBucketOwnerPreferred:
		return s3types.ObjectOwnershipBucketOwnerPreferred
	case models.BucketObjectOwnershipObjectWriter:
		return s3types.ObjectOwnershipObjectWriter
	default:
		return s3types.ObjectOwnershipBucketOwnerEnforced
	}
}

func mapAWSAccessError(err error, bucket string, op string) error {
	if err == nil {
		return nil
	}
	if isAWSAPICode(err, "NoSuchBucket") {
		return BucketNotFoundError(bucket)
	}
	if isAWSAPICode(err, "AccessDenied") {
		return AccessDeniedError(bucket, op)
	}
	return UpstreamOperationError("bucket_access_error", "failed to "+op+" bucket access controls", bucket, err)
}

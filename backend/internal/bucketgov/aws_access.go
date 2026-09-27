package bucketgov

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
)

func (a *awsAdapter) GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
	client, err := a.clientFor(profile, bucket)
	if err != nil {
		return models.BucketAccessView{}, err
	}
	out, err := client.GetBucketOwnershipControls(ctx, &s3.GetBucketOwnershipControlsInput{
		Bucket: &bucket,
	})
	if err != nil {
		if isAWSAPICode(err, "OwnershipControlsNotFoundError") {
			view := newAWSAccessView(bucket, "")
			view.ObjectOwnership = nil
			view.Warnings = append(view.Warnings, "Object Ownership controls are not configured; BucketOwnerEnforced has not been verified.")
			return view, nil
		}
		return models.BucketAccessView{}, mapAWSAccessError(err, bucket, "get")
	}

	if out == nil || out.OwnershipControls == nil || len(out.OwnershipControls.Rules) != 1 {
		return models.BucketAccessView{}, UpstreamOperationError("bucket_access_error", "invalid Object Ownership response", bucket, errors.New("expected one ownership rule"))
	}
	mode := fromS3ObjectOwnership(out.OwnershipControls.Rules[0].ObjectOwnership)
	if mode == "" {
		return models.BucketAccessView{}, UpstreamOperationError("bucket_access_error", "invalid Object Ownership response", bucket, errors.New("unknown ownership mode"))
	}
	return newAWSAccessView(bucket, mode), nil
}

func (a *awsAdapter) PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error {
	client, err := a.clientFor(profile, bucket)
	if err != nil {
		return err
	}
	_, err = client.PutBucketOwnershipControls(ctx, &s3.PutBucketOwnershipControlsInput{
		Bucket: &bucket,
		OwnershipControls: &s3types.OwnershipControls{
			Rules: []s3types.OwnershipControlsRule{
				{ObjectOwnership: toS3ObjectOwnership(*req.ObjectOwnership)},
			},
		},
	})
	readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	observed, readErr := a.GetAccess(readCtx, profile, bucket)
	if err != nil {
		return mapAWSAccessError(err, bucket, "put")
	}
	if readErr != nil || observed.ObjectOwnership == nil || observed.ObjectOwnership.Mode != *req.ObjectOwnership {
		return &OperationError{Status: http.StatusBadGateway, Code: "bucket_access_unconfirmed", Message: "Object Ownership update was accepted but current state did not confirm the request; reload before retrying", Details: map[string]any{"bucket": bucket}}
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
	case s3types.ObjectOwnershipBucketOwnerEnforced:
		return models.BucketObjectOwnershipBucketOwnerEnforced
	default:
		return ""
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

package bucketgov

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
)

func (a *awsAdapter) GetEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketEncryptionView, error) {
	client, err := a.clientFor(profile, bucket)
	if err != nil {
		return models.BucketEncryptionView{}, err
	}
	out, err := client.GetBucketEncryption(ctx, &s3.GetBucketEncryptionInput{
		Bucket: &bucket,
	})
	if err != nil {
		if isAWSAPICode(err, "ServerSideEncryptionConfigurationNotFoundError") {
			return implicitSSES3EncryptionView(bucket), nil
		}
		return models.BucketEncryptionView{}, mapAWSEncryptionError(err, bucket, "get")
	}

	return newAWSEncryptionView(bucket, out)
}

func (a *awsAdapter) PutEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketEncryptionPutRequest) error {
	rule, err := a.toS3EncryptionRule(ctx, profile, bucket, req)
	if err != nil {
		return err
	}

	client, err := a.clientFor(profile, bucket)
	if err != nil {
		return err
	}
	_, putErr := client.PutBucketEncryption(ctx, &s3.PutBucketEncryptionInput{
		Bucket: &bucket,
		ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{
			Rules: []s3types.ServerSideEncryptionRule{rule},
		},
	})
	if putErr != nil {
		return mapAWSEncryptionError(putErr, bucket, "put")
	}
	return nil
}

func (a *awsAdapter) toS3EncryptionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketEncryptionPutRequest) (s3types.ServerSideEncryptionRule, error) {
	if req.Mode != models.BucketEncryptionModeSSES3 && req.Mode != models.BucketEncryptionModeSSEKMS {
		return s3types.ServerSideEncryptionRule{}, InvalidEnumFieldError("mode", string(req.Mode), string(models.BucketEncryptionModeSSES3), string(models.BucketEncryptionModeSSEKMS))
	}
	rule, err := a.currentEncryptionRule(ctx, profile, bucket)
	if err != nil {
		return s3types.ServerSideEncryptionRule{}, err
	}
	byDefault := &s3types.ServerSideEncryptionByDefault{SSEAlgorithm: s3types.ServerSideEncryptionAes256}
	if req.Mode == models.BucketEncryptionModeSSEKMS {
		byDefault.SSEAlgorithm = s3types.ServerSideEncryptionAwsKms
		if rule.ApplyServerSideEncryptionByDefault != nil && rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm == s3types.ServerSideEncryptionAwsKmsDsse {
			byDefault.SSEAlgorithm = s3types.ServerSideEncryptionAwsKmsDsse
		}
		if key := strings.TrimSpace(req.KMSKeyID); key != "" {
			byDefault.KMSMasterKeyID = &key
		}
	} else {
		rule.BucketKeyEnabled = nil
	}
	rule.ApplyServerSideEncryptionByDefault = byDefault
	return rule, nil
}

func (a *awsAdapter) currentEncryptionRule(ctx context.Context, profile models.ProfileSecrets, bucket string) (s3types.ServerSideEncryptionRule, error) {
	client, err := a.clientFor(profile, bucket)
	if err != nil {
		return s3types.ServerSideEncryptionRule{}, err
	}
	out, err := client.GetBucketEncryption(ctx, &s3.GetBucketEncryptionInput{Bucket: &bucket})
	if err != nil {
		if isAWSAPICode(err, "ServerSideEncryptionConfigurationNotFoundError") {
			return s3types.ServerSideEncryptionRule{}, nil
		}
		return s3types.ServerSideEncryptionRule{}, mapAWSEncryptionError(err, bucket, "get")
	}
	if _, err := newAWSEncryptionView(bucket, out); err != nil {
		return s3types.ServerSideEncryptionRule{}, err
	}
	rule, err := firstS3EncryptionRule(out)
	if err != nil {
		return s3types.ServerSideEncryptionRule{}, mapAWSEncryptionError(err, bucket, "get")
	}
	return *rule, nil
}

func newAWSEncryptionView(bucket string, out *s3.GetBucketEncryptionOutput) (models.BucketEncryptionView, error) {
	rule, err := firstS3EncryptionRule(out)
	if err != nil {
		return models.BucketEncryptionView{}, mapAWSEncryptionError(err, bucket, "get")
	}

	view := models.BucketEncryptionView{
		Provider: models.ProfileProviderAwsS3,
		Bucket:   strings.TrimSpace(bucket),
	}

	def := rule.ApplyServerSideEncryptionByDefault
	switch def.SSEAlgorithm {
	case s3types.ServerSideEncryptionAes256:
		view.Mode = models.BucketEncryptionModeSSES3
	case s3types.ServerSideEncryptionAwsKms:
		view.Mode = models.BucketEncryptionModeSSEKMS
	case s3types.ServerSideEncryptionAwsKmsDsse:
		view.Mode = models.BucketEncryptionModeSSEKMS
		view.Warnings = append(view.Warnings, "DSSE-KMS is configured and will be preserved when saving in SSE-KMS mode. Selecting SSE-S3 replaces it.")
	default:
		return models.BucketEncryptionView{}, &OperationError{
			Status:  http.StatusBadGateway,
			Code:    "bucket_encryption_unsupported_algorithm",
			Message: "bucket encryption algorithm is not supported by this client",
			Details: map[string]any{
				"bucket":    strings.TrimSpace(bucket),
				"algorithm": string(def.SSEAlgorithm),
			},
		}
	}

	if def.KMSMasterKeyID != nil {
		view.KMSKeyID = strings.TrimSpace(*def.KMSMasterKeyID)
	}
	if rule.BucketKeyEnabled != nil && *rule.BucketKeyEnabled {
		view.Warnings = append(view.Warnings, "S3 Bucket Key is enabled and will be preserved on SSE-KMS updates, but cannot be edited in this client.")
	}
	return view, nil
}

func firstS3EncryptionRule(out *s3.GetBucketEncryptionOutput) (*s3types.ServerSideEncryptionRule, error) {
	if out == nil || out.ServerSideEncryptionConfiguration == nil || len(out.ServerSideEncryptionConfiguration.Rules) != 1 {
		return nil, errors.New("expected exactly one encryption rule")
	}
	rule := &out.ServerSideEncryptionConfiguration.Rules[0]
	if rule.ApplyServerSideEncryptionByDefault == nil || rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm == "" {
		return nil, errors.New("missing default encryption algorithm")
	}
	return rule, nil
}

func implicitSSES3EncryptionView(bucket string) models.BucketEncryptionView {
	view := models.BucketEncryptionView{
		Provider: models.ProfileProviderAwsS3,
		Bucket:   strings.TrimSpace(bucket),
		Mode:     models.BucketEncryptionModeSSES3,
	}
	view.Warnings = append(view.Warnings, "Bucket default encryption is not explicitly configured; Amazon S3 will apply SSE-S3 by default.")
	return view
}

func mapAWSEncryptionError(err error, bucket string, op string) error {
	if err == nil {
		return nil
	}
	if isAWSAPICode(err, "NoSuchBucket") {
		return BucketNotFoundError(bucket)
	}
	if isAWSAPICode(err, "AccessDenied") {
		return AccessDeniedError(bucket, op)
	}
	return UpstreamOperationError("bucket_encryption_error", "failed to "+op+" bucket encryption", bucket, err)
}

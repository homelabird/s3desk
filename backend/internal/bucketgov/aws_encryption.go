package bucketgov

import (
	"context"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
)

func (a *awsAdapter) GetEncryption(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketEncryptionView, error) {
	client := a.newClient(profile)
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
	if err := ValidateEncryptionPut(models.ProfileProviderAwsS3, req); err != nil {
		return err
	}

	rule, err := a.toS3EncryptionRule(ctx, profile, bucket, req)
	if err != nil {
		return err
	}

	client := a.newClient(profile)
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
	kmsKeyID := strings.TrimSpace(req.KMSKeyID)
	switch req.Mode {
	case models.BucketEncryptionModeSSES3:
		return s3types.ServerSideEncryptionRule{
			ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{
				SSEAlgorithm: s3types.ServerSideEncryptionAes256,
			},
		}, nil
	case models.BucketEncryptionModeSSEKMS:
		bucketKeyEnabled, err := a.currentBucketKeyEnabled(ctx, profile, bucket)
		if err != nil {
			return s3types.ServerSideEncryptionRule{}, err
		}
		byDefault := &s3types.ServerSideEncryptionByDefault{
			SSEAlgorithm: s3types.ServerSideEncryptionAwsKms,
		}
		if kmsKeyID != "" {
			byDefault.KMSMasterKeyID = &kmsKeyID
		}
		rule := s3types.ServerSideEncryptionRule{
			ApplyServerSideEncryptionByDefault: byDefault,
		}
		if bucketKeyEnabled {
			rule.BucketKeyEnabled = boolPtr(true)
		}
		return rule, nil
	default:
		return s3types.ServerSideEncryptionRule{}, InvalidEnumFieldError("mode", string(req.Mode),
			string(models.BucketEncryptionModeSSES3),
			string(models.BucketEncryptionModeSSEKMS),
		)
	}
}

func (a *awsAdapter) currentBucketKeyEnabled(ctx context.Context, profile models.ProfileSecrets, bucket string) (bool, error) {
	client := a.newClient(profile)
	out, err := client.GetBucketEncryption(ctx, &s3.GetBucketEncryptionInput{
		Bucket: &bucket,
	})
	if err != nil {
		if isAWSAPICode(err, "ServerSideEncryptionConfigurationNotFoundError") {
			return false, nil
		}
		return false, mapAWSEncryptionError(err, bucket, "get")
	}

	rule := firstS3EncryptionRule(out)
	if rule == nil || rule.BucketKeyEnabled == nil {
		return false, nil
	}
	return *rule.BucketKeyEnabled, nil
}

func newAWSEncryptionView(bucket string, out *s3.GetBucketEncryptionOutput) (models.BucketEncryptionView, error) {
	rule := firstS3EncryptionRule(out)
	if rule == nil || rule.ApplyServerSideEncryptionByDefault == nil {
		return implicitSSES3EncryptionView(bucket), nil
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
		view.Warnings = append(view.Warnings, "DSSE-KMS is configured; saving changes here will replace it with standard SSE-KMS.")
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

func firstS3EncryptionRule(out *s3.GetBucketEncryptionOutput) *s3types.ServerSideEncryptionRule {
	if out == nil || out.ServerSideEncryptionConfiguration == nil || len(out.ServerSideEncryptionConfiguration.Rules) == 0 {
		return nil
	}
	return &out.ServerSideEncryptionConfiguration.Rules[0]
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

package bucketgov

import (
	"bytes"
	"strings"

	"s3desk/internal/models"
)

func ValidateVersioningPut(ctx ValidationContext, req models.BucketVersioningPutRequest) error {
	if req.Status == "" {
		return RequiredFieldError("status", map[string]any{"section": "versioning"})
	}
	if !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityVersioning) {
		return UnsupportedFieldError(ctx.Provider, "versioning", "status", models.BucketGovernanceCapabilityVersioning, map[string]any{
			"value": req.Status,
		})
	}
	switch ctx.Provider {
	case models.ProfileProviderAwsS3:
		switch req.Status {
		case models.BucketVersioningStatusEnabled, models.BucketVersioningStatusSuspended:
			return nil
		default:
			return InvalidEnumFieldError("status", string(req.Status),
				string(models.BucketVersioningStatusEnabled),
				string(models.BucketVersioningStatusSuspended),
			)
		}
	case models.ProfileProviderGcpGcs, models.ProfileProviderAzureBlob, models.ProfileProviderOciObjectStorage:
		switch req.Status {
		case models.BucketVersioningStatusEnabled, models.BucketVersioningStatusDisabled:
			return nil
		default:
			return InvalidEnumFieldError("status", string(req.Status),
				string(models.BucketVersioningStatusEnabled),
				string(models.BucketVersioningStatusDisabled),
			)
		}
	default:
		return nil
	}
}

func ValidateEncryptionPut(ctx ValidationContext, req models.BucketEncryptionPutRequest) error {
	if req.Mode == "" {
		return RequiredFieldError("mode", map[string]any{"section": "encryption"})
	}
	if !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityDefaultEncryption) {
		return UnsupportedFieldError(ctx.Provider, "encryption", "mode", models.BucketGovernanceCapabilityDefaultEncryption, map[string]any{
			"value": req.Mode,
		})
	}
	if ctx.Provider != models.ProfileProviderAwsS3 {
		return nil
	}
	switch req.Mode {
	case models.BucketEncryptionModeSSES3:
		if strings.TrimSpace(req.KMSKeyID) != "" {
			return InvalidFieldError("kmsKeyId", "kmsKeyId is not allowed for sse_s3", map[string]any{
				"section": "encryption",
				"mode":    req.Mode,
			})
		}
		return nil
	case models.BucketEncryptionModeSSEKMS:
		return nil
	default:
		return InvalidEnumFieldError("mode", string(req.Mode),
			string(models.BucketEncryptionModeSSES3),
			string(models.BucketEncryptionModeSSEKMS),
		)
	}
}

func ValidateLifecyclePut(ctx ValidationContext, req models.BucketLifecyclePutRequest) error {
	if len(bytes.TrimSpace(req.Rules)) == 0 {
		return RequiredFieldError("rules", map[string]any{"section": "lifecycle"})
	}
	if !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityLifecycle) {
		return UnsupportedFieldError(ctx.Provider, "lifecycle", "rules", models.BucketGovernanceCapabilityLifecycle, nil)
	}
	if ctx.Provider != models.ProfileProviderAwsS3 {
		return nil
	}
	_, err := parseAWSLifecycleRulesJSON(req.Rules)
	return err
}

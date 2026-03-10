package bucketgov

import (
	"bytes"
	"strings"

	"s3desk/internal/models"
)

func ValidateVersioningPut(provider models.ProfileProvider, req models.BucketVersioningPutRequest) error {
	if req.Status == "" {
		return RequiredFieldError("status", map[string]any{"section": "versioning"})
	}
	if !capabilityEnabled(provider, models.BucketGovernanceCapabilityVersioning) {
		return UnsupportedFieldError(provider, "versioning", "status", models.BucketGovernanceCapabilityVersioning, map[string]any{
			"value": req.Status,
		})
	}
	switch provider {
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

func ValidateEncryptionPut(provider models.ProfileProvider, req models.BucketEncryptionPutRequest) error {
	if req.Mode == "" {
		return RequiredFieldError("mode", map[string]any{"section": "encryption"})
	}
	if !capabilityEnabled(provider, models.BucketGovernanceCapabilityDefaultEncryption) {
		return UnsupportedFieldError(provider, "encryption", "mode", models.BucketGovernanceCapabilityDefaultEncryption, map[string]any{
			"value": req.Mode,
		})
	}
	if provider != models.ProfileProviderAwsS3 {
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

func ValidateLifecyclePut(provider models.ProfileProvider, req models.BucketLifecyclePutRequest) error {
	if len(bytes.TrimSpace(req.Rules)) == 0 {
		return RequiredFieldError("rules", map[string]any{"section": "lifecycle"})
	}
	if !capabilityEnabled(provider, models.BucketGovernanceCapabilityLifecycle) {
		return UnsupportedFieldError(provider, "lifecycle", "rules", models.BucketGovernanceCapabilityLifecycle, nil)
	}
	if provider != models.ProfileProviderAwsS3 {
		return nil
	}
	_, err := parseAWSLifecycleRulesJSON(req.Rules)
	return err
}

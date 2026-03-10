package bucketgov

import (
	"strings"

	"s3desk/internal/models"
)

func ValidatePublicExposurePut(provider models.ProfileProvider, req models.BucketPublicExposurePutRequest) error {
	if req.BlockPublicAccess != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilityPublicAccessBlock) {
		return UnsupportedFieldError(provider, "public-exposure", "blockPublicAccess", models.BucketGovernanceCapabilityPublicAccessBlock, nil)
	}
	if req.PublicAccessPrevention != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilityPublicAccessPrevention) {
		return UnsupportedFieldError(provider, "public-exposure", "publicAccessPrevention", models.BucketGovernanceCapabilityPublicAccessPrevention, nil)
	}
	if strings.TrimSpace(req.Visibility) != "" && !capabilityEnabled(provider, models.BucketGovernanceCapabilityAccessPublicToggle) {
		return UnsupportedFieldError(provider, "public-exposure", "visibility", models.BucketGovernanceCapabilityAccessPublicToggle, nil)
	}
	if req.Mode == "" && req.BlockPublicAccess == nil && req.PublicAccessPrevention == nil && strings.TrimSpace(req.Visibility) == "" {
		return InvalidFieldError("blockPublicAccess", "blockPublicAccess or mode is required", map[string]any{
			"section":          "public-exposure",
			"alternativeField": "mode",
		})
	}

	if provider == models.ProfileProviderAwsS3 && req.Mode != "" {
		switch req.Mode {
		case models.BucketPublicExposureModePrivate, models.BucketPublicExposureModePublic:
			return nil
		case models.BucketPublicExposureModeBlob, models.BucketPublicExposureModeContainer:
			return UnsupportedFieldError(provider, "public-exposure", "mode", models.BucketGovernanceCapabilityAccessPublicToggle, map[string]any{
				"value": req.Mode,
			})
		default:
			return InvalidEnumFieldError("mode", string(req.Mode),
				string(models.BucketPublicExposureModePrivate),
				string(models.BucketPublicExposureModePublic),
			)
		}
	}

	if provider == models.ProfileProviderGcpGcs {
		mode := strings.TrimSpace(string(req.Mode))
		if mode == "" {
			mode = strings.ToLower(strings.TrimSpace(req.Visibility))
		}
		if mode == "" && req.PublicAccessPrevention != nil {
			return nil
		}
		switch models.BucketPublicExposureMode(mode) {
		case models.BucketPublicExposureModePrivate, models.BucketPublicExposureModePublic:
			return nil
		default:
			return InvalidEnumFieldError("mode", mode,
				string(models.BucketPublicExposureModePrivate),
				string(models.BucketPublicExposureModePublic),
			)
		}
	}

	if provider == models.ProfileProviderAzureBlob {
		mode := strings.TrimSpace(string(req.Mode))
		if mode == "" {
			mode = strings.ToLower(strings.TrimSpace(req.Visibility))
		}
		switch models.BucketPublicExposureMode(mode) {
		case models.BucketPublicExposureModePrivate,
			models.BucketPublicExposureModeBlob,
			models.BucketPublicExposureModeContainer:
			return nil
		default:
			return InvalidEnumFieldError("mode", mode,
				string(models.BucketPublicExposureModePrivate),
				string(models.BucketPublicExposureModeBlob),
				string(models.BucketPublicExposureModeContainer),
			)
		}
	}

	if provider == models.ProfileProviderOciObjectStorage {
		value := strings.ToLower(strings.TrimSpace(req.Visibility))
		if value == "" {
			value = strings.ToLower(strings.TrimSpace(string(req.Mode)))
		}
		switch value {
		case "private", "public", "object_read", "object_read_without_list":
			return nil
		default:
			return InvalidEnumFieldError("visibility", value, "private", "object_read", "object_read_without_list")
		}
	}

	return nil
}

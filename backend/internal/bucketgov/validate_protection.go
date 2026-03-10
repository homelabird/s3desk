package bucketgov

import (
	"strconv"
	"strings"

	"s3desk/internal/models"
)

func ValidateProtectionPut(provider models.ProfileProvider, req models.BucketProtectionPutRequest) error {
	if req.UniformAccess != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilityUniformAccess) {
		return UnsupportedFieldError(provider, "protection", "uniformAccess", models.BucketGovernanceCapabilityUniformAccess, nil)
	}
	if req.Retention != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilityRetention) {
		return UnsupportedFieldError(provider, "protection", "retention", models.BucketGovernanceCapabilityRetention, nil)
	}
	if req.ObjectLock != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilityObjectLock) {
		return UnsupportedFieldError(provider, "protection", "objectLock", models.BucketGovernanceCapabilityObjectLock, nil)
	}
	if req.SoftDelete != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilitySoftDelete) {
		return UnsupportedFieldError(provider, "protection", "softDelete", models.BucketGovernanceCapabilitySoftDelete, nil)
	}
	if req.Immutability != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilityImmutability) {
		return UnsupportedFieldError(provider, "protection", "immutability", models.BucketGovernanceCapabilityImmutability, nil)
	}
	if req.UniformAccess == nil && req.Retention == nil && req.ObjectLock == nil && req.SoftDelete == nil && req.Immutability == nil {
		return InvalidFieldError("protection", "protection must include at least one setting", map[string]any{
			"section": "protection",
		})
	}

	if req.Retention != nil {
		if len(req.Retention.Rules) > 0 && provider != models.ProfileProviderOciObjectStorage {
			return UnsupportedFieldError(provider, "protection", "retention.rules", models.BucketGovernanceCapabilityRetention, nil)
		}
		if req.Retention.Enabled {
			if len(req.Retention.Rules) > 0 {
				if provider == models.ProfileProviderOciObjectStorage && len(req.Retention.Rules) > 100 {
					return InvalidFieldError("retention.rules", "OCI allows a maximum of 100 retention rules per bucket", map[string]any{
						"section": "protection",
					})
				}
				for index, rule := range req.Retention.Rules {
					if rule.Days == nil || *rule.Days <= 0 {
						return InvalidFieldError("retention.rules["+strconv.Itoa(index)+"].days", "retention rule days must be greater than zero when retention is enabled", map[string]any{
							"section": "protection",
						})
					}
				}
			} else if req.Retention.Days == nil || *req.Retention.Days <= 0 {
				return InvalidFieldError("retention.days", "retention.days must be greater than zero when retention is enabled", map[string]any{
					"section": "protection",
				})
			}
		} else if len(req.Retention.Rules) > 0 {
			return InvalidFieldError("retention.rules", "retention.rules must be empty when retention is disabled", map[string]any{
				"section": "protection",
			})
		}
	}
	if req.SoftDelete != nil && req.SoftDelete.Enabled {
		if req.SoftDelete.Days == nil || *req.SoftDelete.Days <= 0 {
			return InvalidFieldError("softDelete.days", "softDelete.days must be greater than zero when soft delete is enabled", map[string]any{
				"section": "protection",
			})
		}
	}
	if provider == models.ProfileProviderAzureBlob && req.Immutability != nil {
		mode := strings.ToLower(strings.TrimSpace(req.Immutability.Mode))
		if mode != "" && mode != "unlocked" && mode != "locked" {
			return InvalidEnumFieldError("immutability.mode", mode, "unlocked", "locked")
		}
		if req.Immutability.Enabled && (req.Immutability.Days == nil || *req.Immutability.Days <= 0) {
			return InvalidFieldError("immutability.days", "immutability.days must be greater than zero when Azure immutability is enabled", map[string]any{
				"section": "protection",
			})
		}
		if req.Immutability.AllowProtectedAppendWrites && req.Immutability.AllowProtectedAppendWritesAll {
			return InvalidFieldError("immutability.allowProtectedAppendWritesAll", "allowProtectedAppendWrites and allowProtectedAppendWritesAll are mutually exclusive", map[string]any{
				"section": "protection",
			})
		}
	}

	return nil
}

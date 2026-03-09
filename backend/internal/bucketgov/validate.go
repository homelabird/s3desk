package bucketgov

import (
	"bytes"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/models"
)

func ValidateAccessPut(provider models.ProfileProvider, req models.BucketAccessPutRequest) error {
	if req.ObjectOwnership != nil && !capabilityEnabled(provider, models.BucketGovernanceCapabilityObjectOwnership) {
		return UnsupportedFieldError(provider, "access", "objectOwnership", models.BucketGovernanceCapabilityObjectOwnership, nil)
	}
	if len(req.Bindings) > 0 && !capabilityEnabled(provider, models.BucketGovernanceCapabilityAccessBindings) {
		return UnsupportedFieldError(provider, "access", "bindings", models.BucketGovernanceCapabilityAccessBindings, nil)
	}
	if strings.TrimSpace(req.ETag) != "" && !capabilityEnabled(provider, models.BucketGovernanceCapabilityAccessBindings) {
		return UnsupportedFieldError(provider, "access", "etag", models.BucketGovernanceCapabilityAccessBindings, nil)
	}
	if len(req.StoredAccessPolicies) > 0 && !capabilityEnabled(provider, models.BucketGovernanceCapabilityStoredAccessPolicy) {
		return UnsupportedFieldError(provider, "access", "storedAccessPolicies", models.BucketGovernanceCapabilityStoredAccessPolicy, nil)
	}

	if provider == models.ProfileProviderAwsS3 {
		if req.ObjectOwnership == nil {
			return RequiredFieldError("objectOwnership", map[string]any{"section": "access"})
		}
		switch *req.ObjectOwnership {
		case models.BucketObjectOwnershipBucketOwnerEnforced,
			models.BucketObjectOwnershipBucketOwnerPreferred,
			models.BucketObjectOwnershipObjectWriter:
			return nil
		default:
			return InvalidEnumFieldError("objectOwnership", string(*req.ObjectOwnership),
				string(models.BucketObjectOwnershipBucketOwnerEnforced),
				string(models.BucketObjectOwnershipBucketOwnerPreferred),
				string(models.BucketObjectOwnershipObjectWriter),
			)
		}
	}

	if provider == models.ProfileProviderAzureBlob {
		if len(req.StoredAccessPolicies) > 5 {
			return InvalidFieldError("storedAccessPolicies", "Azure allows a maximum of 5 stored access policies", map[string]any{
				"section": "access",
			})
		}
		seen := make(map[string]struct{}, len(req.StoredAccessPolicies))
		for i, item := range req.StoredAccessPolicies {
			index := strconv.Itoa(i)
			if strings.TrimSpace(item.ID) == "" {
				return InvalidFieldError("storedAccessPolicies["+index+"].id", "stored access policy id is required", map[string]any{
					"section": "access",
				})
			}
			key := strings.ToLower(strings.TrimSpace(item.ID))
			if _, ok := seen[key]; ok {
				return InvalidFieldError("storedAccessPolicies["+index+"].id", "stored access policy id must be unique", map[string]any{
					"section": "access",
					"value":   item.ID,
				})
			}
			seen[key] = struct{}{}

			if start := strings.TrimSpace(item.Start); start != "" {
				if _, err := time.Parse(time.RFC3339, start); err != nil {
					return InvalidFieldError("storedAccessPolicies["+index+"].start", "stored access policy start must be RFC3339", map[string]any{
						"section": "access",
						"value":   item.Start,
					})
				}
			}
			if expiry := strings.TrimSpace(item.Expiry); expiry != "" {
				if _, err := time.Parse(time.RFC3339, expiry); err != nil {
					return InvalidFieldError("storedAccessPolicies["+index+"].expiry", "stored access policy expiry must be RFC3339", map[string]any{
						"section": "access",
						"value":   item.Expiry,
					})
				}
			}
			if permission := strings.ToLower(strings.TrimSpace(item.Permission)); permission != "" {
				for _, ch := range permission {
					if !strings.ContainsRune("rwdlacup", ch) {
						return InvalidFieldError("storedAccessPolicies["+index+"].permission", "stored access policy permission must use only r,w,d,l,a,c,u,p", map[string]any{
							"section": "access",
							"value":   item.Permission,
						})
					}
				}
			}
		}
	}

	return nil
}

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
			} else {
				if req.Retention.Days == nil || *req.Retention.Days <= 0 {
					return InvalidFieldError("retention.days", "retention.days must be greater than zero when retention is enabled", map[string]any{
						"section": "protection",
					})
				}
			}
		} else if len(req.Retention.Rules) > 0 {
			return InvalidFieldError("retention.rules", "retention.rules must be empty when retention is disabled", map[string]any{
				"section": "protection",
			})
		}
	}
	if req.SoftDelete != nil {
		if req.SoftDelete.Enabled {
			if req.SoftDelete.Days == nil || *req.SoftDelete.Days <= 0 {
				return InvalidFieldError("softDelete.days", "softDelete.days must be greater than zero when soft delete is enabled", map[string]any{
					"section": "protection",
				})
			}
		}
	}
	if provider == models.ProfileProviderAzureBlob && req.Immutability != nil {
		mode := strings.ToLower(strings.TrimSpace(req.Immutability.Mode))
		if mode != "" && mode != "unlocked" && mode != "locked" {
			return InvalidEnumFieldError("immutability.mode", mode, "unlocked", "locked")
		}
		if req.Immutability.Enabled {
			if req.Immutability.Days == nil || *req.Immutability.Days <= 0 {
				return InvalidFieldError("immutability.days", "immutability.days must be greater than zero when Azure immutability is enabled", map[string]any{
					"section": "protection",
				})
			}
		}
		if req.Immutability.AllowProtectedAppendWrites && req.Immutability.AllowProtectedAppendWritesAll {
			return InvalidFieldError("immutability.allowProtectedAppendWritesAll", "allowProtectedAppendWrites and allowProtectedAppendWritesAll are mutually exclusive", map[string]any{
				"section": "protection",
			})
		}
	}

	return nil
}

func capabilityEnabled(provider models.ProfileProvider, capability models.BucketGovernanceCapability) bool {
	state, ok := ProviderGovernanceCapabilities(provider)[capability]
	return ok && state.Enabled
}

func ValidateSharingPut(provider models.ProfileProvider, req models.BucketSharingPutRequest) error {
	if len(req.PreauthenticatedRequests) > 0 && !capabilityEnabled(provider, models.BucketGovernanceCapabilityPAR) {
		return UnsupportedFieldError(provider, "sharing", "preauthenticatedRequests", models.BucketGovernanceCapabilityPAR, nil)
	}
	if len(req.StoredAccessPolicies) > 0 && provider != models.ProfileProviderAzureBlob {
		return UnsupportedFieldError(provider, "sharing", "storedAccessPolicies", models.BucketGovernanceCapabilityStoredAccessPolicy, nil)
	}
	if provider == models.ProfileProviderOciObjectStorage {
		if len(req.PreauthenticatedRequests) > 100 {
			return InvalidFieldError("preauthenticatedRequests", "OCI allows a maximum of 100 pre-authenticated requests per bucket", map[string]any{
				"section": "sharing",
			})
		}
		for index, item := range req.PreauthenticatedRequests {
			id := strings.TrimSpace(item.ID)
			if id != "" {
				continue
			}
			if strings.TrimSpace(item.Name) == "" {
				return InvalidFieldError("preauthenticatedRequests["+strconv.Itoa(index)+"].name", "PAR name is required", map[string]any{
					"section": "sharing",
				})
			}
			switch strings.TrimSpace(item.AccessType) {
			case "AnyObjectRead", "AnyObjectWrite", "AnyObjectReadWrite":
			default:
				return InvalidEnumFieldError("preauthenticatedRequests["+strconv.Itoa(index)+"].accessType", strings.TrimSpace(item.AccessType), "AnyObjectRead", "AnyObjectWrite", "AnyObjectReadWrite")
			}
			if strings.TrimSpace(item.TimeExpires) == "" {
				return InvalidFieldError("preauthenticatedRequests["+strconv.Itoa(index)+"].timeExpires", "PAR timeExpires is required", map[string]any{
					"section": "sharing",
				})
			}
			if _, err := time.Parse(time.RFC3339, strings.TrimSpace(item.TimeExpires)); err != nil {
				return InvalidFieldError("preauthenticatedRequests["+strconv.Itoa(index)+"].timeExpires", "PAR timeExpires must be RFC3339", map[string]any{
					"section": "sharing",
					"value":   item.TimeExpires,
				})
			}
			switch value := strings.TrimSpace(item.BucketListingAction); value {
			case "", "Deny", "ListObjects":
			default:
				return InvalidEnumFieldError("preauthenticatedRequests["+strconv.Itoa(index)+"].bucketListingAction", value, "Deny", "ListObjects")
			}
		}
	}
	return nil
}

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

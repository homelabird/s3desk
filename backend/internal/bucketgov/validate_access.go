package bucketgov

import (
	"encoding/json"
	"strconv"
	"strings"
	"unicode/utf8"

	"s3desk/internal/azureacl"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
)

func ValidateAccessPut(ctx ValidationContext, req models.BucketAccessPutRequest) error {
	if req.ObjectOwnership != nil && !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityObjectOwnership) {
		return UnsupportedFieldError(ctx.Provider, "access", "objectOwnership", models.BucketGovernanceCapabilityObjectOwnership, nil)
	}
	if len(req.Bindings) > 0 && !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityAccessBindings) {
		return UnsupportedFieldError(ctx.Provider, "access", "bindings", models.BucketGovernanceCapabilityAccessBindings, nil)
	}
	if strings.TrimSpace(req.ETag) != "" && !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityAccessBindings) {
		return UnsupportedFieldError(ctx.Provider, "access", "etag", models.BucketGovernanceCapabilityAccessBindings, nil)
	}
	if len(req.StoredAccessPolicies) > 0 && !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityStoredAccessPolicy) {
		return UnsupportedFieldError(ctx.Provider, "access", "storedAccessPolicies", models.BucketGovernanceCapabilityStoredAccessPolicy, nil)
	}

	if ctx.Provider == models.ProfileProviderAwsS3 {
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

	if ctx.Provider == models.ProfileProviderGcpGcs {
		for i, binding := range req.Bindings {
			field := "bindings[" + strconv.Itoa(i) + "]"
			if strings.TrimSpace(binding.Role) == "" {
				return RequiredFieldError(field+".role", map[string]any{"section": "access"})
			}
			if len(binding.Members) == 0 {
				return RequiredFieldError(field+".members", map[string]any{"section": "access"})
			}
			if len(binding.Condition) > 0 {
				var condition any
				if err := json.Unmarshal(binding.Condition, &condition); err != nil {
					return InvalidFieldError(field+".condition", "condition must be a JSON object", map[string]any{"section": "access"})
				}
				if err := gcsiam.ValidateCondition(condition); err != nil {
					return InvalidFieldError(field+".condition", err.Error(), map[string]any{"section": "access"})
				}
			}

			for _, member := range binding.Members {
				if strings.TrimSpace(member) == "" {
					return InvalidFieldError(field+".members", "binding members must be non-empty strings", map[string]any{"section": "access"})
				}
			}
		}
	}

	if ctx.Provider == models.ProfileProviderAzureBlob {
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
			key := strings.TrimSpace(item.ID)
			if utf8.RuneCountInString(key) > 64 {
				return InvalidFieldError("storedAccessPolicies["+index+"].id", "stored access policy id must not exceed 64 characters", map[string]any{"section": "access"})
			}
			if _, ok := seen[key]; ok {
				return InvalidFieldError("storedAccessPolicies["+index+"].id", "stored access policy id must be unique", map[string]any{
					"section": "access",
					"value":   item.ID,
				})
			}
			seen[key] = struct{}{}

			if start := strings.TrimSpace(item.Start); start != "" {
				if err := azureacl.ValidateStoredPolicyTime(start); err != nil {
					return InvalidFieldError("storedAccessPolicies["+index+"].start", "stored access policy start must be an ISO 8601 date or timestamp with timezone", map[string]any{
						"section": "access",
						"value":   item.Start,
					})
				}
			}
			if expiry := strings.TrimSpace(item.Expiry); expiry != "" {
				if err := azureacl.ValidateStoredPolicyTime(expiry); err != nil {
					return InvalidFieldError("storedAccessPolicies["+index+"].expiry", "stored access policy expiry must be an ISO 8601 date or timestamp with timezone", map[string]any{
						"section": "access",
						"value":   item.Expiry,
					})
				}
			}
			if err := azureacl.ValidateStoredPolicyPermission(item.Permission); err != nil {
				return InvalidFieldError("storedAccessPolicies["+index+"].permission", err.Error(), map[string]any{"section": "access"})
			}
		}
	}

	return nil
}

package bucketgov

import (
	"strconv"
	"strings"
	"time"

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

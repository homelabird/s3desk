package bucketgov

import (
	"strconv"
	"strings"
	"time"

	"s3desk/internal/models"
)

func ValidateSharingPut(ctx ValidationContext, req models.BucketSharingPutRequest) error {
	if len(req.PreauthenticatedRequests) > 0 && !ctx.CapabilityEnabled(models.BucketGovernanceCapabilityPAR) {
		return UnsupportedFieldError(ctx.Provider, "sharing", "preauthenticatedRequests", models.BucketGovernanceCapabilityPAR, nil)
	}
	if len(req.StoredAccessPolicies) > 0 && ctx.Provider != models.ProfileProviderAzureBlob {
		return UnsupportedFieldError(ctx.Provider, "sharing", "storedAccessPolicies", models.BucketGovernanceCapabilityStoredAccessPolicy, nil)
	}
	if ctx.Provider == models.ProfileProviderOciObjectStorage {
		if len(req.PreauthenticatedRequests) > 100 {
			return InvalidFieldError("preauthenticatedRequests", "OCI allows a maximum of 100 pre-authenticated requests per bucket", map[string]any{
				"section": "sharing",
			})
		}
		for index, item := range req.PreauthenticatedRequests {
			if strings.TrimSpace(item.ID) != "" {
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

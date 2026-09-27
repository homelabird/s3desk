package bucketgov

import (
	"fmt"
	"s3desk/internal/models"
	"testing"
)

func TestProviderRetentionBounds(t *testing.T) {
	for _, tc := range []struct {
		name     string
		provider models.ProfileProvider
		max      int
		request  func(*int) models.BucketProtectionPutRequest
	}{
		{"gcs", models.ProfileProviderGcpGcs, 36525, func(days *int) models.BucketProtectionPutRequest {
			return models.BucketProtectionPutRequest{Retention: &models.BucketRetentionView{Enabled: true, Days: days}}
		}},
		{"azure soft delete", models.ProfileProviderAzureBlob, 365, func(days *int) models.BucketProtectionPutRequest {
			return models.BucketProtectionPutRequest{SoftDelete: &models.BucketSoftDeleteView{Enabled: true, Days: days}}
		}},
		{"azure immutability", models.ProfileProviderAzureBlob, 146000, func(days *int) models.BucketProtectionPutRequest {
			return models.BucketProtectionPutRequest{Immutability: &models.BucketImmutabilityView{Enabled: true, Days: days}}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := ValidationContext{Provider: tc.provider, Capabilities: ProviderGovernanceCapabilities(tc.provider)}
			for _, days := range []int{-1, 0, 1, tc.max, tc.max + 1, int(^uint(0) >> 1)} {
				err := ValidateProtectionPut(ctx, tc.request(&days))
				valid := days >= 1 && days <= tc.max
				if (err == nil) != valid {
					t.Fatalf("days=%d error=%v", days, err)
				}
			}
		})
	}
}

func TestOCISharingHasNoArtificialHundredRequestLimit(t *testing.T) {
	requests := make([]models.BucketPreauthenticatedRequestView, 101)
	for i := range requests {
		requests[i] = models.BucketPreauthenticatedRequestView{ID: fmt.Sprintf("id-%d", i)}
	}
	ctx := ValidationContext{Provider: models.ProfileProviderOciObjectStorage, Capabilities: ProviderGovernanceCapabilities(models.ProfileProviderOciObjectStorage)}
	if err := ValidateSharingPut(ctx, models.BucketSharingPutRequest{PreauthenticatedRequests: requests}); err != nil {
		t.Fatal(err)
	}
	requests[100].ID = requests[0].ID
	if err := ValidateSharingPut(ctx, models.BucketSharingPutRequest{PreauthenticatedRequests: requests}); err == nil {
		t.Fatal("duplicate ID must still fail")
	}
}

func TestOCISharingListingRequiresReadAccess(t *testing.T) {
	for _, access := range []string{"AnyObjectRead", "AnyObjectWrite", "AnyObjectReadWrite"} {
		for _, listing := range []string{"", "Deny", "ListObjects"} {
			req := models.BucketSharingPutRequest{PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{{Name: "link", AccessType: access, BucketListingAction: listing, TimeExpires: "2030-01-01T00:00:00Z"}}}
			err := ValidateSharingPut(newValidationContext(models.ProfileProviderOciObjectStorage, "demo"), req)
			if (err != nil) != (access == "AnyObjectWrite" && listing == "ListObjects") {
				t.Fatalf("access=%s listing=%s err=%v", access, listing, err)
			}
		}
	}
}

func TestOCISharingPreservesCaseSensitiveIDs(t *testing.T) {
	req := models.BucketSharingPutRequest{PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{{ID: "PAR/aB+="}, {ID: "PAR/Ab+="}}}
	if err := ValidateSharingPut(newValidationContext(models.ProfileProviderOciObjectStorage, "demo"), req); err != nil {
		t.Fatal(err)
	}
	req.PreauthenticatedRequests = append(req.PreauthenticatedRequests, req.PreauthenticatedRequests[0])
	if err := ValidateSharingPut(newValidationContext(models.ProfileProviderOciObjectStorage, "demo"), req); err == nil {
		t.Fatal("duplicate ID accepted")
	}
}

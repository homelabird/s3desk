package azureutil

import (
	"fmt"
	"strings"

	"s3desk/internal/models"
)

// BlobEndpoint returns the configured Azure Blob endpoint or the default endpoint
// derived from the profile. The default emulator endpoint must stay consistent
// across rclone-backed and direct REST-backed code paths.
func BlobEndpoint(profile models.ProfileSecrets) string {
	accountName := strings.TrimSpace(profile.AzureAccountName)
	endpoint := strings.TrimSpace(profile.AzureEndpoint)
	if endpoint != "" {
		return endpoint
	}
	if profile.AzureUseEmulator {
		if accountName == "" {
			return ""
		}
		return fmt.Sprintf("http://azurite:10000/%s", accountName)
	}
	if accountName == "" {
		return ""
	}
	return fmt.Sprintf("https://%s.blob.core.windows.net", accountName)
}

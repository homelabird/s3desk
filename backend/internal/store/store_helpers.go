package store

import (
	"strings"

	"s3desk/internal/models"
)

func normalizeProfileProvider(p models.ProfileProvider) models.ProfileProvider {
	value := strings.TrimSpace(string(p))
	if value == "" {
		return models.ProfileProviderS3Compatible
	}
	if value == "oci_s3_compat" {
		return models.ProfileProviderS3Compatible
	}
	switch models.ProfileProvider(value) {
	case models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
		models.ProfileProviderAzureBlob,
		models.ProfileProviderGcpGcs,
		models.ProfileProviderOciObjectStorage:
		return models.ProfileProvider(value)
	default:
		return models.ProfileProvider(value)
	}
}

func isS3LikeProvider(p models.ProfileProvider) bool {
	switch p {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		return true
	default:
		return false
	}
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

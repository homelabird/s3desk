package jobs

import (
	"context"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/s3client"
)

func cleanupS3PrefixMarkerIfEmpty(ctx context.Context, secrets models.ProfileSecrets, bucket, prefix string, allowRemote bool) error {
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return nil
	}

	bucket = strings.TrimSpace(bucket)
	prefix = normalizeKeyInput(prefix, secrets.PreserveLeadingSlash)
	if bucket == "" || prefix == "" || !strings.HasSuffix(prefix, "/") {
		return nil
	}

	return s3client.DeletePrefixMarkerIfEmpty(ctx, secrets, bucket, prefix, s3client.ProfileOptions{AllowRemote: allowRemote})
}

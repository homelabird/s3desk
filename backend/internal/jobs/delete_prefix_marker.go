package jobs

import (
	"context"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
)

func cleanupS3PrefixMarkerIfEmpty(ctx context.Context, secrets models.ProfileSecrets, bucket, prefix string) error {
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return nil
	}

	bucket = strings.TrimSpace(bucket)
	prefix = normalizeKeyInput(prefix, secrets.PreserveLeadingSlash)
	if bucket == "" || prefix == "" || !strings.HasSuffix(prefix, "/") {
		return nil
	}

	client := s3ClientFromProfile(secrets)
	resp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(bucket),
		Prefix:  aws.String(prefix),
		MaxKeys: aws.Int32(2),
	})
	if err != nil {
		return err
	}

	for _, obj := range resp.Contents {
		if obj.Key == nil {
			continue
		}
		if *obj.Key != prefix {
			return nil
		}
	}

	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(prefix),
	})
	return err
}

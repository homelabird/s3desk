package s3client

import (
	"context"
	"errors"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

func CreateMultipartUpload(ctx context.Context, client *s3.Client, bucket, key, contentType string) (*s3.CreateMultipartUploadOutput, error) {
	input := &s3.CreateMultipartUploadInput{
		Bucket: &bucket,
		Key:    &key,
	}
	if contentType = strings.TrimSpace(contentType); contentType != "" {
		input.ContentType = &contentType
	}
	return client.CreateMultipartUpload(ctx, input)
}

func CompleteMultipartUpload(ctx context.Context, client *s3.Client, bucket, key, uploadID string, parts []types.CompletedPart) error {
	_, err := client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   &bucket,
		Key:      &key,
		UploadId: &uploadID,
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: parts,
		},
	})
	return err
}

func AbortMultipartUpload(ctx context.Context, client *s3.Client, bucket, key, uploadID string) error {
	_, err := client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   &bucket,
		Key:      &key,
		UploadId: &uploadID,
	})
	if isMissingMultipartUpload(err) {
		return nil
	}
	return err
}

func isMissingMultipartUpload(err error) bool {
	if err == nil {
		return false
	}
	var apiErr smithy.APIError
	return errors.As(err, &apiErr) && strings.EqualFold(strings.TrimSpace(apiErr.ErrorCode()), "NoSuchUpload")
}

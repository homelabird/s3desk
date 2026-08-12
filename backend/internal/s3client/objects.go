package s3client

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
)

func PutEmptyObjectWithOptions(ctx context.Context, secrets models.ProfileSecrets, bucket, key string, opts ProfileOptions) error {
	client, err := FromProfileWithOptions(secrets, opts)
	if err != nil {
		return err
	}
	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: &bucket,
		Key:    &key,
		Body:   bytes.NewReader(nil),
	})
	if err != nil {
		return &ObjectPutError{Bucket: bucket, Key: key, Err: err}
	}
	return err
}

type ObjectPutError struct {
	Bucket string
	Key    string
	Err    error
}

func (e *ObjectPutError) Error() string {
	if e == nil {
		return "failed to put S3 object"
	}
	return fmt.Sprintf("failed to put S3 object %q/%q: %v", e.Bucket, e.Key, e.Err)
}

func (e *ObjectPutError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

type MarkerDeleteError struct {
	Bucket string
	Key    string
	Err    error
}

func (e *MarkerDeleteError) Error() string {
	if e == nil {
		return "failed to delete S3 folder marker"
	}
	return fmt.Sprintf("failed to delete S3 folder marker %q/%q: %v", e.Bucket, e.Key, e.Err)
}

func (e *MarkerDeleteError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func DeleteFolderMarkersWithOptions(ctx context.Context, secrets models.ProfileSecrets, bucket string, keys []string, opts ProfileOptions) error {
	markerKeys := make([]string, 0, len(keys))
	for _, key := range keys {
		if strings.HasSuffix(key, "/") {
			markerKeys = append(markerKeys, key)
		}
	}
	if len(markerKeys) == 0 {
		return nil
	}

	client, err := FromProfileWithOptions(secrets, opts)
	if err != nil {
		return err
	}
	for _, key := range markerKeys {
		if _, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &bucket, Key: &key}); err != nil {
			return &MarkerDeleteError{Bucket: bucket, Key: key, Err: err}
		}
	}
	return nil
}

func DeletePrefixMarkerIfEmpty(ctx context.Context, secrets models.ProfileSecrets, bucket, prefix string, opts ProfileOptions) error {
	client, err := FromProfileWithOptions(secrets, opts)
	if err != nil {
		return err
	}
	resp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  &bucket,
		Prefix:  &prefix,
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
	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &bucket, Key: &prefix})
	return err
}

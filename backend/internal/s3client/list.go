package s3client

import (
	"context"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
)

// ListPage issues one bounded S3 request. No rclone subprocess or per-object
// HEAD call is needed for metadata already included in ListObjectsV2.
func ListPage(client *s3.Client) objectlisting.Fetch {
	return func(ctx context.Context, req objectlisting.Request) (objectlisting.Page, error) {
		input := &s3.ListObjectsV2Input{Bucket: aws.String(req.Bucket), Prefix: aws.String(req.Prefix),
			MaxKeys: aws.Int32(int32(req.MaxKeys)), EncodingType: types.EncodingTypeUrl}
		if req.Delimiter != "" {
			input.Delimiter = aws.String(req.Delimiter)
		}
		if req.ContinuationToken != "" {
			input.ContinuationToken = aws.String(req.ContinuationToken)
		}
		result, err := client.ListObjectsV2(ctx, input)
		if err != nil {
			return objectlisting.Page{}, err
		}
		page := objectlisting.Page{IsTruncated: aws.ToBool(result.IsTruncated), NextToken: aws.ToString(result.NextContinuationToken)}
		encoded := result.EncodingType == types.EncodingTypeUrl
		for _, p := range result.CommonPrefixes {
			key, err := objectlisting.DecodeKey(aws.ToString(p.Prefix), encoded)
			if err != nil {
				return objectlisting.Page{}, objectlisting.ErrInvalidPage
			}
			page.CommonPrefixes = append(page.CommonPrefixes, key)
		}
		for _, obj := range result.Contents {
			key, err := objectlisting.DecodeKey(aws.ToString(obj.Key), encoded)
			if err != nil {
				return objectlisting.Page{}, objectlisting.ErrInvalidPage
			}
			item := models.ObjectItem{Key: key, Size: aws.ToInt64(obj.Size), ETag: strings.Trim(aws.ToString(obj.ETag), "\""), StorageClass: string(obj.StorageClass)}
			if obj.LastModified != nil {
				item.LastModified = obj.LastModified.UTC().Format(time.RFC3339Nano)
			}
			page.Items = append(page.Items, item)
		}
		return page, nil
	}
}

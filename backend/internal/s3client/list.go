package s3client

import (
	"context"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
	"s3desk/internal/s3listing"
)

// ListPage issues one bounded S3 request. No rclone subprocess or per-object
// HEAD call is needed for metadata already included in ListObjectsV2.
func ListPage(client *s3.Client) s3listing.Fetch {
	return func(ctx context.Context, req s3listing.Request) (s3listing.Page, error) {
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
			return s3listing.Page{}, err
		}
		page := s3listing.Page{IsTruncated: aws.ToBool(result.IsTruncated), NextToken: aws.ToString(result.NextContinuationToken)}
		encoded := result.EncodingType == types.EncodingTypeUrl
		for _, p := range result.CommonPrefixes {
			key, err := s3listing.DecodeKey(aws.ToString(p.Prefix), encoded)
			if err != nil {
				return s3listing.Page{}, s3listing.ErrInvalidPage
			}
			page.CommonPrefixes = append(page.CommonPrefixes, key)
		}
		for _, obj := range result.Contents {
			key, err := s3listing.DecodeKey(aws.ToString(obj.Key), encoded)
			if err != nil {
				return s3listing.Page{}, s3listing.ErrInvalidPage
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

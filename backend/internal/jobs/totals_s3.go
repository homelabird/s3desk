package jobs

import (
	"context"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type s3PrefixTotals struct {
	Objects int64
	Bytes   int64
}

func computeS3PrefixTotals(
	ctx context.Context,
	client *s3.Client,
	bucket string,
	prefix string,
	include []string,
	exclude []string,
	maxObjects int64,
) (totals s3PrefixTotals, ok bool, err error) {
	if maxObjects <= 0 {
		maxObjects = 50_000
	}

	var token *string
	for {
		select {
		case <-ctx.Done():
			return s3PrefixTotals{}, false, ctx.Err()
		default:
		}

		out, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: token,
			MaxKeys:           aws.Int32(1000),
		})
		if err != nil {
			return s3PrefixTotals{}, false, err
		}

		for _, obj := range out.Contents {
			key := aws.ToString(obj.Key)
			if key == "" {
				continue
			}

			rel := key
			if prefix != "" && strings.HasPrefix(key, prefix) {
				rel = strings.TrimPrefix(key, prefix)
			}

			if !shouldIncludePath(rel, include, exclude) {
				continue
			}

			totals.Objects++
			totals.Bytes += aws.ToInt64(obj.Size)
			if totals.Objects > maxObjects {
				return s3PrefixTotals{}, false, nil
			}
		}

		if !aws.ToBool(out.IsTruncated) || out.NextContinuationToken == nil || *out.NextContinuationToken == "" {
			break
		}
		token = out.NextContinuationToken
	}

	return totals, true, nil
}


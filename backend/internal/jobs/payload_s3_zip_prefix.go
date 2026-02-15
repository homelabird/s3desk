package jobs

type s3ZipPrefixPayload struct {
	Bucket string
	Prefix string
}

func parseS3ZipPrefixPayload(payload map[string]any) (s3ZipPrefixPayload, error) {
	bucket, err := payloadOptionalString(payload, "bucket")
	if err != nil {
		return s3ZipPrefixPayload{}, err
	}
	prefix, err := payloadOptionalString(payload, "prefix")
	if err != nil {
		return s3ZipPrefixPayload{}, err
	}

	return s3ZipPrefixPayload{
		Bucket: bucket,
		Prefix: prefix,
	}, nil
}


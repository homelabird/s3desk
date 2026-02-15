package jobs

type s3DeleteObjectsPayload struct {
	Bucket string
	Keys   []string
}

func parseS3DeleteObjectsPayload(payload map[string]any) (s3DeleteObjectsPayload, error) {
	bucket, err := payloadOptionalString(payload, "bucket")
	if err != nil {
		return s3DeleteObjectsPayload{}, err
	}
	keys, err := payloadOptionalStringSlice(payload, "keys")
	if err != nil {
		return s3DeleteObjectsPayload{}, err
	}

	return s3DeleteObjectsPayload{
		Bucket: bucket,
		Keys:   keys,
	}, nil
}


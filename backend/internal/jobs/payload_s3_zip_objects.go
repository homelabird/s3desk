package jobs

type s3ZipObjectsPayload struct {
	Bucket      string
	Keys        []string
	StripPrefix string
}

func parseS3ZipObjectsPayload(payload map[string]any) (s3ZipObjectsPayload, error) {
	bucket, err := payloadOptionalString(payload, "bucket")
	if err != nil {
		return s3ZipObjectsPayload{}, err
	}
	keys, err := payloadOptionalStringSlice(payload, "keys")
	if err != nil {
		return s3ZipObjectsPayload{}, err
	}
	stripPrefix, err := payloadOptionalString(payload, "stripPrefix")
	if err != nil {
		return s3ZipObjectsPayload{}, err
	}

	return s3ZipObjectsPayload{
		Bucket:      bucket,
		Keys:        keys,
		StripPrefix: stripPrefix,
	}, nil
}


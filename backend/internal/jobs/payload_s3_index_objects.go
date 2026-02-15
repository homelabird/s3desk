package jobs

type s3IndexObjectsPayload struct {
	Bucket      string
	Prefix      string
	FullReindex bool
}

func parseS3IndexObjectsPayload(payload map[string]any) (s3IndexObjectsPayload, error) {
	bucket, err := payloadOptionalString(payload, "bucket")
	if err != nil {
		return s3IndexObjectsPayload{}, err
	}
	prefix, err := payloadOptionalString(payload, "prefix")
	if err != nil {
		return s3IndexObjectsPayload{}, err
	}

	fullReindex, err := payloadOptionalBoolOr(payload, "fullReindex", true)
	if err != nil {
		return s3IndexObjectsPayload{}, err
	}

	return s3IndexObjectsPayload{
		Bucket:      bucket,
		Prefix:      prefix,
		FullReindex: fullReindex,
	}, nil
}

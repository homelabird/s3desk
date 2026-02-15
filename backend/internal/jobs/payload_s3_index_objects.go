package jobs

import "fmt"

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

	fullReindex := true
	if v, ok := payload["fullReindex"]; ok && v != nil {
		b, ok := v.(bool)
		if !ok {
			return s3IndexObjectsPayload{}, fmt.Errorf("payload.fullReindex must be a boolean")
		}
		fullReindex = b
	}

	return s3IndexObjectsPayload{
		Bucket:      bucket,
		Prefix:      prefix,
		FullReindex: fullReindex,
	}, nil
}


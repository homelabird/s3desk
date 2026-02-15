package jobs

import "fmt"

type transferDeletePrefixPayload struct {
	Bucket            string
	Prefix            string
	DeleteAll         bool
	DryRun            bool
	AllowUnsafePrefix bool
	Include           []string
	Exclude           []string
}

func parseTransferDeletePrefixPayload(payload map[string]any) (transferDeletePrefixPayload, error) {
	bucket, err := payloadOptionalString(payload, "bucket")
	if err != nil {
		return transferDeletePrefixPayload{}, err
	}
	prefix, err := payloadOptionalString(payload, "prefix")
	if err != nil {
		return transferDeletePrefixPayload{}, err
	}
	deleteAll, err := payloadOptionalBool(payload, "deleteAll")
	if err != nil {
		return transferDeletePrefixPayload{}, err
	}
	dryRun, err := payloadOptionalBool(payload, "dryRun")
	if err != nil {
		return transferDeletePrefixPayload{}, err
	}
	allowUnsafePrefix, err := payloadOptionalBool(payload, "allowUnsafePrefix")
	if err != nil {
		return transferDeletePrefixPayload{}, err
	}
	include, err := payloadOptionalStringSlice(payload, "include")
	if err != nil {
		return transferDeletePrefixPayload{}, err
	}
	exclude, err := payloadOptionalStringSlice(payload, "exclude")
	if err != nil {
		return transferDeletePrefixPayload{}, err
	}

	return transferDeletePrefixPayload{
		Bucket:            bucket,
		Prefix:            prefix,
		DeleteAll:         deleteAll,
		DryRun:            dryRun,
		AllowUnsafePrefix: allowUnsafePrefix,
		Include:           include,
		Exclude:           exclude,
	}, nil
}

func payloadOptionalString(payload map[string]any, key string) (string, error) {
	v, ok := payload[key]
	if !ok || v == nil {
		return "", nil
	}
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("payload.%s must be a string", key)
	}
	return s, nil
}

func payloadOptionalBool(payload map[string]any, key string) (bool, error) {
	v, ok := payload[key]
	if !ok || v == nil {
		return false, nil
	}
	b, ok := v.(bool)
	if !ok {
		return false, fmt.Errorf("payload.%s must be a boolean", key)
	}
	return b, nil
}

func payloadOptionalStringSlice(payload map[string]any, key string) ([]string, error) {
	v, ok := payload[key]
	if !ok || v == nil {
		return nil, nil
	}

	switch vv := v.(type) {
	case []string:
		out := make([]string, len(vv))
		copy(out, vv)
		return out, nil
	case []any:
		out := make([]string, 0, len(vv))
		for idx, item := range vv {
			s, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("payload.%s[%d] must be a string", key, idx)
			}
			out = append(out, s)
		}
		return out, nil
	default:
		return nil, fmt.Errorf("payload.%s must be an array of strings", key)
	}
}

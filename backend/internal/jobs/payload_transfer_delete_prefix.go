package jobs

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

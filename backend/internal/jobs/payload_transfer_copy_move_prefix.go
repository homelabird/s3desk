package jobs

type transferCopyMovePrefixPayload struct {
	SrcBucket string
	SrcPrefix string
	DstBucket string
	DstPrefix string
	DryRun    bool
	Include   []string
	Exclude   []string
}

func parseTransferCopyMovePrefixPayload(payload map[string]any) (transferCopyMovePrefixPayload, error) {
	srcBucket, err := payloadOptionalString(payload, "srcBucket")
	if err != nil {
		return transferCopyMovePrefixPayload{}, err
	}
	srcPrefix, err := payloadOptionalString(payload, "srcPrefix")
	if err != nil {
		return transferCopyMovePrefixPayload{}, err
	}
	dstBucket, err := payloadOptionalString(payload, "dstBucket")
	if err != nil {
		return transferCopyMovePrefixPayload{}, err
	}
	dstPrefix, err := payloadOptionalString(payload, "dstPrefix")
	if err != nil {
		return transferCopyMovePrefixPayload{}, err
	}
	dryRun, err := payloadOptionalBool(payload, "dryRun")
	if err != nil {
		return transferCopyMovePrefixPayload{}, err
	}
	include, err := payloadOptionalStringSlice(payload, "include")
	if err != nil {
		return transferCopyMovePrefixPayload{}, err
	}
	exclude, err := payloadOptionalStringSlice(payload, "exclude")
	if err != nil {
		return transferCopyMovePrefixPayload{}, err
	}

	return transferCopyMovePrefixPayload{
		SrcBucket: srcBucket,
		SrcPrefix: srcPrefix,
		DstBucket: dstBucket,
		DstPrefix: dstPrefix,
		DryRun:    dryRun,
		Include:   include,
		Exclude:   exclude,
	}, nil
}

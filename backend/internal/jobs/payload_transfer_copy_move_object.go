package jobs

type transferCopyMoveObjectPayload struct {
	SrcBucket string
	SrcKey    string
	DstBucket string
	DstKey    string
	DryRun    bool
}

func parseTransferCopyMoveObjectPayload(payload map[string]any) (transferCopyMoveObjectPayload, error) {
	srcBucket, err := payloadOptionalString(payload, "srcBucket")
	if err != nil {
		return transferCopyMoveObjectPayload{}, err
	}
	srcKey, err := payloadOptionalString(payload, "srcKey")
	if err != nil {
		return transferCopyMoveObjectPayload{}, err
	}
	dstBucket, err := payloadOptionalString(payload, "dstBucket")
	if err != nil {
		return transferCopyMoveObjectPayload{}, err
	}
	dstKey, err := payloadOptionalString(payload, "dstKey")
	if err != nil {
		return transferCopyMoveObjectPayload{}, err
	}
	dryRun, err := payloadOptionalBool(payload, "dryRun")
	if err != nil {
		return transferCopyMoveObjectPayload{}, err
	}

	return transferCopyMoveObjectPayload{
		SrcBucket: srcBucket,
		SrcKey:    srcKey,
		DstBucket: dstBucket,
		DstKey:    dstKey,
		DryRun:    dryRun,
	}, nil
}

package jobs

type transferSyncLocalPathPayload struct {
	Bucket           string
	Prefix           string
	LocalPath        string
	DryRun           bool
	DeleteExtraneous bool
	Include          []string
	Exclude          []string
}

func parseTransferSyncLocalPathPayload(payload map[string]any) (transferSyncLocalPathPayload, error) {
	bucket, err := payloadOptionalString(payload, "bucket")
	if err != nil {
		return transferSyncLocalPathPayload{}, err
	}
	prefix, err := payloadOptionalString(payload, "prefix")
	if err != nil {
		return transferSyncLocalPathPayload{}, err
	}
	localPath, err := payloadOptionalString(payload, "localPath")
	if err != nil {
		return transferSyncLocalPathPayload{}, err
	}
	dryRun, err := payloadOptionalBool(payload, "dryRun")
	if err != nil {
		return transferSyncLocalPathPayload{}, err
	}
	deleteExtraneous, err := payloadOptionalBool(payload, "deleteExtraneous")
	if err != nil {
		return transferSyncLocalPathPayload{}, err
	}
	include, err := payloadOptionalStringSlice(payload, "include")
	if err != nil {
		return transferSyncLocalPathPayload{}, err
	}
	exclude, err := payloadOptionalStringSlice(payload, "exclude")
	if err != nil {
		return transferSyncLocalPathPayload{}, err
	}

	return transferSyncLocalPathPayload{
		Bucket:           bucket,
		Prefix:           prefix,
		LocalPath:        localPath,
		DryRun:           dryRun,
		DeleteExtraneous: deleteExtraneous,
		Include:          include,
		Exclude:          exclude,
	}, nil
}

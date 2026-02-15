package jobs

type transferSyncStagingToS3Payload struct {
	UploadID string
}

func parseTransferSyncStagingToS3Payload(payload map[string]any) (transferSyncStagingToS3Payload, error) {
	uploadID, err := payloadOptionalString(payload, "uploadId")
	if err != nil {
		return transferSyncStagingToS3Payload{}, err
	}

	return transferSyncStagingToS3Payload{
		UploadID: uploadID,
	}, nil
}

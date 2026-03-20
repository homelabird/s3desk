package jobs

import "strings"

func isSupportedJobType(jobType string) bool {
	switch jobType {
	case JobTypeTransferSyncLocalToS3,
		JobTypeTransferSyncStagingToS3,
		JobTypeTransferSyncS3ToLocal,
		JobTypeTransferDeletePrefix,
		JobTypeTransferCopyObject,
		JobTypeTransferMoveObject,
		JobTypeTransferCopyBatch,
		JobTypeTransferMoveBatch,
		JobTypeTransferCopyPrefix,
		JobTypeTransferMovePrefix,
		JobTypeS3ZipPrefix,
		JobTypeS3ZipObjects,
		JobTypeS3DeleteObjects,
		JobTypeS3IndexObjects:
		return true
	default:
		return false
	}
}

func isTransferJobType(jobType string) bool {
	return strings.HasPrefix(jobType, "transfer_")
}

func transferDirectionForJobType(jobType string) string {
	switch jobType {
	case JobTypeTransferSyncLocalToS3, JobTypeTransferSyncStagingToS3:
		return "upload"
	case JobTypeTransferSyncS3ToLocal:
		return "download"
	default:
		return ""
	}
}

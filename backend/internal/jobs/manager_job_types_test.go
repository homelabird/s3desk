package jobs

import "testing"

func TestRequiresRcloneCoversRcloneBackedJobTypes(t *testing.T) {
	t.Parallel()

	rcloneBackedTypes := []string{
		JobTypeTransferSyncLocalToS3,
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
		JobTypeS3IndexObjects,
	}
	for _, jobType := range rcloneBackedTypes {
		if !RequiresRclone(jobType) {
			t.Fatalf("RequiresRclone(%q)=false, want true", jobType)
		}
	}

	for _, jobType := range []string{JobTypeTransferDirectUpload, "unknown"} {
		if RequiresRclone(jobType) {
			t.Fatalf("RequiresRclone(%q)=true, want false", jobType)
		}
	}
}

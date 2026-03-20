package jobs

import (
	"context"
	"fmt"

	"s3desk/internal/models"
)

func (m *Manager) dispatchJobExecution(
	ctx context.Context,
	profileID string,
	jobID string,
	job models.Job,
	preserveLeadingSlash bool,
) error {
	switch job.Type {
	case JobTypeTransferSyncStagingToS3:
		return m.runTransferSyncStagingToS3(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferSyncLocalToS3:
		return m.runTransferSyncLocalToS3(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferSyncS3ToLocal:
		return m.runTransferSyncS3ToLocal(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferDeletePrefix:
		return m.runTransferDeletePrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferCopyObject:
		return m.runTransferCopyObject(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferMoveObject:
		return m.runTransferMoveObject(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferCopyBatch:
		return m.runTransferCopyBatch(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferMoveBatch:
		return m.runTransferMoveBatch(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferCopyPrefix:
		return m.runTransferCopyPrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferMovePrefix:
		return m.runTransferMovePrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeS3ZipPrefix:
		return m.runS3ZipPrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeS3ZipObjects:
		return m.runS3ZipObjects(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeS3DeleteObjects:
		return m.runS3DeleteObjects(ctx, profileID, jobID, job.Payload)
	case JobTypeS3IndexObjects:
		return m.runS3IndexObjects(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	default:
		return fmt.Errorf("unsupported job type: %s", job.Type)
	}
}

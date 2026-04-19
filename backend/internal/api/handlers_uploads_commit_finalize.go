package api

import (
	"context"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func (s *server) finalizeImmediateUploadCommit(ctx context.Context, profileID, uploadID string, us store.UploadSession, payload map[string]any, progress *models.JobProgress, indexEntries []store.ObjectIndexEntry) (models.Job, *uploadHTTPError) {
	return newUploadCommitFinalizeService(s).finalizeImmediate(ctx, profileID, uploadID, us, payload, progress, indexEntries)
}

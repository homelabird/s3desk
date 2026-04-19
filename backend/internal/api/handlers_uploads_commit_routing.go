package api

import (
	"context"

	"s3desk/internal/models"
)

func (s *server) executeUploadCommit(ctx context.Context, session uploadCommitSession, req uploadCommitRequest) (models.JobCreatedResponse, *uploadHTTPError) {
	return newUploadCommitExecutionService(s).execute(ctx, session, req)
}

func buildStagingUploadCommitPayload(session uploadCommitSession, req uploadCommitRequest) map[string]any {
	return newUploadCommitArtifactService().buildStagingPayload(session, req)
}

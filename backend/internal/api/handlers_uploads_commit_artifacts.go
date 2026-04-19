package api

import (
	"s3desk/internal/models"
	"s3desk/internal/store"
)

type uploadCommitArtifacts struct {
	payload      map[string]any
	indexEntries []store.ObjectIndexEntry
	progress     *models.JobProgress
}

func buildUploadCommitBasePayload(uploadID string, us store.UploadSession, req uploadCommitRequest) map[string]any {
	return newUploadCommitArtifactService().buildBasePayload(uploadID, us, req)
}

func buildUploadCommitArtifacts(uploadID string, us store.UploadSession, req uploadCommitRequest) uploadCommitArtifacts {
	return newUploadCommitArtifactService().buildFromRequest(uploadID, us, req)
}

func buildUploadCommitProgress(req uploadCommitRequest) *models.JobProgress {
	return newUploadCommitArtifactService().buildProgress(req)
}

func buildVerifiedUploadCommitArtifacts(uploadID string, us store.UploadSession, req uploadCommitRequest, verified []verifiedUploadObject, includeTotals bool, itemsTruncated bool) uploadCommitArtifacts {
	return newUploadCommitArtifactService().buildFromVerified(uploadID, us, req, verified, includeTotals, itemsTruncated)
}

func buildVerifiedUploadCommitProgress(totalFiles int, totalBytes int64, includeTotals bool) *models.JobProgress {
	return newUploadCommitArtifactService().buildVerifiedProgress(totalFiles, totalBytes, includeTotals)
}

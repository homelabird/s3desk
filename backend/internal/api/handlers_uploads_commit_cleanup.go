package api

import (
	"context"
	"time"

	"s3desk/internal/logging"
)

const immediateUploadCleanupTimeout = 5 * time.Second

func (s *server) cleanupImmediateUploadCommitState(ctx context.Context, profileID, uploadID string) {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), immediateUploadCleanupTimeout)
	defer cancel()

	cleanup := func(step string, err error) {
		if err == nil {
			return
		}
		logging.ErrorFields("immediate upload cleanup failed", map[string]any{
			"event":      "upload.immediate_cleanup_failed",
			"profile_id": profileID,
			"upload_id":  uploadID,
			"step":       step,
			"error":      err.Error(),
		})
	}

	cleanup("multipart_metadata", s.store.DeleteMultipartUploadsBySession(cleanupCtx, profileID, uploadID))
	cleanup("upload_object_metadata", s.store.DeleteUploadObjectsBySession(cleanupCtx, profileID, uploadID))
	_, err := s.store.DeleteUploadSession(cleanupCtx, profileID, uploadID)
	cleanup("upload_session", err)
}

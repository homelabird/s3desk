package api

import "context"

func (s *server) cleanupImmediateUploadCommitState(ctx context.Context, profileID, uploadID string) {
	_ = s.store.DeleteMultipartUploadsBySession(ctx, profileID, uploadID)
	_ = s.store.DeleteUploadObjectsBySession(ctx, profileID, uploadID)
	_, _ = s.store.DeleteUploadSession(ctx, profileID, uploadID)
}

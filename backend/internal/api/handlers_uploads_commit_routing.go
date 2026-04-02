package api

import "net/http"

func (s *server) dispatchUploadCommit(w http.ResponseWriter, r *http.Request, session uploadCommitSession, req uploadCommitRequest) {
	switch session.mode {
	case uploadModePresigned:
		s.handlePresignedUploadCommit(w, r, session.profileID, session.uploadID, session.us, req)
	case uploadModeDirect:
		s.handleDirectUploadCommit(w, r, session.profileID, session.uploadID, session.us, req)
	default:
		s.handleStagingUploadCommit(w, r, session.profileID, buildStagingUploadCommitPayload(session, req))
	}
}

func buildStagingUploadCommitPayload(session uploadCommitSession, req uploadCommitRequest) map[string]any {
	return buildUploadCommitArtifacts(session.uploadID, session.us, req).payload
}

package api

import (
	"net/http"
	"strings"
)

func (s *server) handleUploadFiles(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := uploadIDFromRequest(r)
	if profileID == "" || uploadID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and uploadId are required", nil)
		return
	}

	release, ok := s.acquireUploadSlot(w)
	if !ok {
		return
	}
	defer release()

	us, ok, err := s.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load upload session", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "upload session not found", map[string]any{"uploadId": uploadID})
		return
	}
	mode, stagingDir, ok := s.loadWritableUploadSession(w, r, us)
	if !ok {
		return
	}

	chunkIndexRaw := strings.TrimSpace(r.Header.Get("X-Upload-Chunk-Index"))
	switch {
	case mode == uploadModeDirect && chunkIndexRaw != "":
		s.handleDirectMultipartChunkUpload(w, r, profileID, uploadID, us, chunkIndexRaw)
	case mode == uploadModeDirect:
		s.handleDirectMultipartFormUpload(w, r, profileID, uploadID, us)
	case chunkIndexRaw != "":
		s.handleStagingChunkUpload(w, r, profileID, uploadID, stagingDir, us.Bytes, chunkIndexRaw)
	default:
		s.handleStagingMultipartFormUpload(w, r, profileID, uploadID, stagingDir, us.Bytes)
	}
}

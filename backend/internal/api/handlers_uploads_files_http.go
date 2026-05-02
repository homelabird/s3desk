package api

import (
	"net/http"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type uploadFilesPreparedRequest struct {
	profileID     string
	uploadID      string
	us            store.UploadSession
	mode          string
	stagingDir    string
	chunkIndexRaw string
	err           *uploadHTTPError
}

type uploadFilesHTTPService struct {
	server *server
}

func newUploadFilesHTTPService(s *server) uploadFilesHTTPService {
	return uploadFilesHTTPService{server: s}
}

func buildUploadFilesHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc uploadFilesHTTPService) prepareUpload(r *http.Request) uploadFilesPreparedRequest {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := uploadIDFromRequest(r)
	if profileID == "" || uploadID == "" {
		return uploadFilesPreparedRequest{err: newUploadBadRequestError("profile and uploadId are required", nil)}
	}

	us, ok, err := svc.server.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		return uploadFilesPreparedRequest{err: newUploadInternalError("failed to load upload session", nil)}
	}
	if !ok {
		return uploadFilesPreparedRequest{err: &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "upload session not found",
			details: map[string]any{"uploadId": uploadID},
		}}
	}

	mode, stagingDir, uploadErr := svc.server.loadWritableUploadSession(us)
	if uploadErr != nil {
		return uploadFilesPreparedRequest{err: uploadErr}
	}

	return uploadFilesPreparedRequest{
		profileID:     profileID,
		uploadID:      uploadID,
		us:            us,
		mode:          mode,
		stagingDir:    stagingDir,
		chunkIndexRaw: strings.TrimSpace(r.Header.Get("X-Upload-Chunk-Index")),
	}
}

func (svc uploadFilesHTTPService) executePrepared(w http.ResponseWriter, r *http.Request, prepared uploadFilesPreparedRequest) {
	switch {
	case prepared.mode == uploadModeDirect && prepared.chunkIndexRaw != "":
		svc.server.handleDirectMultipartChunkUpload(w, r, prepared.profileID, prepared.uploadID, prepared.us, prepared.chunkIndexRaw)
	case prepared.mode == uploadModeDirect:
		svc.server.handleDirectMultipartFormUpload(w, r, prepared.profileID, prepared.uploadID, prepared.us)
	case prepared.chunkIndexRaw != "":
		svc.server.handleStagingChunkUpload(w, r, prepared.profileID, prepared.uploadID, prepared.stagingDir, prepared.us.Bytes, prepared.chunkIndexRaw)
	default:
		svc.server.handleStagingMultipartFormUpload(w, r, prepared.profileID, prepared.uploadID, prepared.stagingDir, prepared.us.Bytes)
	}
}

func (svc uploadFilesHTTPService) executeUpload(w http.ResponseWriter, r *http.Request) {
	prepared := svc.prepareUpload(r)
	if prepared.err != nil {
		resp := buildUploadFilesHTTPErrorResponse(prepared.err.code, prepared.err.message, prepared.err.details)
		writeJSON(w, prepared.err.status, &resp)
		return
	}
	svc.executePrepared(w, r, prepared)
}

func (svc uploadFilesHTTPService) handleUploadFiles(w http.ResponseWriter, r *http.Request) {
	release, ok := svc.server.acquireUploadSlot(w)
	if !ok {
		return
	}
	defer release()

	svc.executeUpload(w, r)
}

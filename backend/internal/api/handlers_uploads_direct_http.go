package api

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type uploadDirectChunkPreparedRequest struct {
	profileID   string
	uploadID    string
	us          store.UploadSession
	chunkValues uploadChunkHeaderValues
	err         *uploadHTTPError
}

type uploadDirectFormPreparedRequest struct {
	profileID      string
	uploadID       string
	us             store.UploadSession
	secrets        models.ProfileSecrets
	reader         *multipart.Reader
	remainingBytes int64
	maxBytes       int64
	err            *uploadHTTPError
}

type uploadDirectHTTPService struct {
	server *server
}

func newUploadDirectHTTPService(s *server) uploadDirectHTTPService {
	return uploadDirectHTTPService{server: s}
}

func (svc uploadDirectHTTPService) prepareChunk(profileID, uploadID string, us store.UploadSession, r *http.Request, chunkIndexRaw string) uploadDirectChunkPreparedRequest {
	chunkValues, uploadErr := parseUploadChunkHeaders(r.Header, chunkIndexRaw, true)
	if uploadErr != nil {
		return uploadDirectChunkPreparedRequest{err: uploadErr}
	}
	return uploadDirectChunkPreparedRequest{
		profileID:   profileID,
		uploadID:    uploadID,
		us:          us,
		chunkValues: chunkValues,
	}
}

func (svc uploadDirectHTTPService) executeChunk(r *http.Request, prepared uploadDirectChunkPreparedRequest) (int, int, *uploadHTTPError) {
	if prepared.err != nil {
		return 0, 0, prepared.err
	}
	if uploadErr := svc.server.directMultipartChunkFlow(r, prepared.profileID, prepared.uploadID, prepared.us, prepared.chunkValues); uploadErr != nil {
		return 0, 0, uploadErr
	}
	return http.StatusNoContent, 0, nil
}

func (svc uploadDirectHTTPService) prepareForm(profileID, uploadID string, us store.UploadSession, r *http.Request) uploadDirectFormPreparedRequest {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return uploadDirectFormPreparedRequest{err: newUploadInternalError("missing profile secrets", nil)}
	}

	reader, err := r.MultipartReader()
	if err != nil {
		return uploadDirectFormPreparedRequest{err: newUploadBadRequestError("expected multipart/form-data", map[string]any{"error": err.Error()})}
	}

	maxBytes := svc.server.cfg.UploadMaxBytes
	remainingBytes, uploadErr := uploadRemainingBytes(maxBytes, us.Bytes)
	if uploadErr != nil {
		return uploadDirectFormPreparedRequest{err: uploadErr}
	}

	return uploadDirectFormPreparedRequest{
		profileID:      profileID,
		uploadID:       uploadID,
		us:             us,
		secrets:        secrets,
		reader:         reader,
		remainingBytes: remainingBytes,
		maxBytes:       maxBytes,
	}
}

func (svc uploadDirectHTTPService) executeForm(r *http.Request, prepared uploadDirectFormPreparedRequest) (int, int, *uploadHTTPError) {
	if prepared.err != nil {
		return 0, 0, prepared.err
	}

	written := 0
	skipped := 0
	remainingBytes := prepared.remainingBytes
	for {
		part, err := prepared.reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return 0, 0, newUploadBadRequestError("failed to read multipart upload", map[string]any{"error": err.Error()})
		}
		if part.FormName() != "files" {
			_ = part.Close()
			continue
		}

		used, skippedPart, uploadErr := svc.server.directMultipartFormPart(r, prepared.secrets, prepared.profileID, prepared.uploadID, prepared.us, part, &remainingBytes, prepared.maxBytes)
		_ = part.Close()
		if uploadErr != nil {
			return 0, 0, uploadErr
		}
		written += used
		skipped += skippedPart
	}

	if written == 0 {
		return 0, 0, newUploadBadRequestError("no files uploaded", nil)
	}
	return http.StatusNoContent, skipped, nil
}

func (svc uploadDirectHTTPService) executeDirectMultipartChunkUpload(r *http.Request, profileID, uploadID string, us store.UploadSession, chunkIndexRaw string) (int, int, *uploadHTTPError) {
	return svc.executeChunk(r, svc.prepareChunk(profileID, uploadID, us, r, chunkIndexRaw))
}

func (svc uploadDirectHTTPService) executeDirectMultipartFormUpload(r *http.Request, profileID, uploadID string, us store.UploadSession) (int, int, *uploadHTTPError) {
	return svc.executeForm(r, svc.prepareForm(profileID, uploadID, us, r))
}

func (svc uploadDirectHTTPService) handleDirectMultipartChunkUpload(w http.ResponseWriter, r *http.Request, profileID, uploadID string, us store.UploadSession, chunkIndexRaw string) {
	status, skipped, uploadErr := svc.executeDirectMultipartChunkUpload(r, profileID, uploadID, us, chunkIndexRaw)
	if skipped > 0 {
		w.Header().Set("X-Upload-Skipped", fmt.Sprintf("%d", skipped))
	}
	if uploadErr != nil {
		errResp := buildUploadFilesHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &errResp)
		return
	}
	w.WriteHeader(status)
}

func (svc uploadDirectHTTPService) handleDirectMultipartFormUpload(w http.ResponseWriter, r *http.Request, profileID, uploadID string, us store.UploadSession) {
	status, skipped, uploadErr := svc.executeDirectMultipartFormUpload(r, profileID, uploadID, us)
	if skipped > 0 {
		w.Header().Set("X-Upload-Skipped", fmt.Sprintf("%d", skipped))
	}
	if uploadErr != nil {
		errResp := buildUploadFilesHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &errResp)
		return
	}
	w.WriteHeader(status)
}

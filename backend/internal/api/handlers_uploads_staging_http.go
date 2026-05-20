package api

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
)

type uploadStagingChunkPreparedRequest struct {
	profileID    string
	uploadID     string
	stagingDir   string
	bytesTracked int64
	chunkValues  uploadChunkHeaderValues
	err          *uploadHTTPError
}

type uploadStagingFormPreparedRequest struct {
	profileID      string
	uploadID       string
	stagingDir     string
	reader         *multipart.Reader
	remainingBytes int64
	maxBytes       int64
	err            *uploadHTTPError
}

type uploadStagingHTTPService struct {
	server *server
}

func newUploadStagingHTTPService(s *server) uploadStagingHTTPService {
	return uploadStagingHTTPService{server: s}
}

func (svc uploadStagingHTTPService) prepareChunk(profileID, uploadID, stagingDir string, bytesTracked int64, r *http.Request, chunkIndexRaw string) uploadStagingChunkPreparedRequest {
	chunkValues, uploadErr := parseUploadChunkHeadersWithoutSizes(r.Header, chunkIndexRaw, true)
	if uploadErr != nil {
		return uploadStagingChunkPreparedRequest{err: uploadErr}
	}
	return uploadStagingChunkPreparedRequest{
		profileID:    profileID,
		uploadID:     uploadID,
		stagingDir:   stagingDir,
		bytesTracked: bytesTracked,
		chunkValues:  chunkValues,
	}
}

func (svc uploadStagingHTTPService) executeChunk(r *http.Request, prepared uploadStagingChunkPreparedRequest) (int, int, *uploadHTTPError) {
	if prepared.err != nil {
		return 0, 0, prepared.err
	}
	if uploadErr := svc.server.stagingChunkFlow(r, prepared.profileID, prepared.uploadID, prepared.stagingDir, prepared.bytesTracked, prepared.chunkValues); uploadErr != nil {
		return 0, 0, uploadErr
	}
	return http.StatusNoContent, 0, nil
}

func (svc uploadStagingHTTPService) prepareForm(profileID, uploadID, stagingDir string, bytesTracked int64, r *http.Request) uploadStagingFormPreparedRequest {
	reader, err := r.MultipartReader()
	if err != nil {
		return uploadStagingFormPreparedRequest{err: newUploadBadRequestError("expected multipart/form-data", map[string]any{"error": err.Error()})}
	}

	maxBytes := svc.server.cfg.UploadMaxBytes
	remainingBytes, uploadErr := uploadRemainingBytes(maxBytes, bytesTracked)
	if uploadErr != nil {
		return uploadStagingFormPreparedRequest{err: uploadErr}
	}

	return uploadStagingFormPreparedRequest{
		profileID:      profileID,
		uploadID:       uploadID,
		stagingDir:     stagingDir,
		reader:         reader,
		remainingBytes: remainingBytes,
		maxBytes:       maxBytes,
	}
}

func (svc uploadStagingHTTPService) executeForm(r *http.Request, prepared uploadStagingFormPreparedRequest) (int, int, *uploadHTTPError) {
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
			return 0, 0, &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "invalid_multipart",
				message: "failed to read multipart body",
				details: map[string]any{"error": err.Error()},
			}
		}
		if part.FormName() != "files" {
			_ = part.Close()
			continue
		}

		used, skippedPart, uploadErr := svc.server.stagingMultipartFormPart(r, prepared.profileID, prepared.uploadID, prepared.stagingDir, part, &remainingBytes, prepared.maxBytes)
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

func (svc uploadStagingHTTPService) executeStagingChunkUpload(r *http.Request, profileID, uploadID, stagingDir string, bytesTracked int64, chunkIndexRaw string) (int, int, *uploadHTTPError) {
	return svc.executeChunk(r, svc.prepareChunk(profileID, uploadID, stagingDir, bytesTracked, r, chunkIndexRaw))
}

func (svc uploadStagingHTTPService) executeStagingMultipartFormUpload(r *http.Request, profileID, uploadID, stagingDir string, bytesTracked int64) (int, int, *uploadHTTPError) {
	return svc.executeForm(r, svc.prepareForm(profileID, uploadID, stagingDir, bytesTracked, r))
}

func (svc uploadStagingHTTPService) handleStagingChunkUpload(w http.ResponseWriter, r *http.Request, profileID, uploadID, stagingDir string, bytesTracked int64, chunkIndexRaw string) {
	status, skipped, uploadErr := svc.executeStagingChunkUpload(r, profileID, uploadID, stagingDir, bytesTracked, chunkIndexRaw)
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

func (svc uploadStagingHTTPService) handleStagingMultipartFormUpload(w http.ResponseWriter, r *http.Request, profileID, uploadID, stagingDir string, bytesTracked int64) {
	status, skipped, uploadErr := svc.executeStagingMultipartFormUpload(r, profileID, uploadID, stagingDir, bytesTracked)
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

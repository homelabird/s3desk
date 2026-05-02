package api

import (
	"net/http"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type uploadMultipartSessionPreparedRequest struct {
	profileID string
	uploadID  string
	us        store.UploadSession
	mode      string
	err       *uploadHTTPError
}

type uploadMultipartCompletePreparedRequest struct {
	session   uploadMultipartSessionPreparedRequest
	decodeErr error
	meta      store.MultipartUpload
	client    *s3.Client
	completed []types.CompletedPart
	err       *uploadHTTPError
}

type uploadMultipartAbortPreparedRequest struct {
	session   uploadMultipartSessionPreparedRequest
	decodeErr error
	meta      store.MultipartUpload
	client    *s3.Client
	err       *uploadHTTPError
}

type uploadMultipartChunksPreparedRequest struct {
	session    uploadMultipartSessionPreparedRequest
	query      uploadChunkQuery
	meta       store.MultipartUpload
	client     *s3.Client
	stagingDir string
	chunkDir   string
	err        *uploadHTTPError
}

type uploadMultipartHTTPService struct {
	server *server
}

func newUploadMultipartHTTPService(s *server) uploadMultipartHTTPService {
	return uploadMultipartHTTPService{server: s}
}

func buildUploadMultipartHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	return buildUploadFilesHTTPErrorResponse(code, message, details)
}

func (svc uploadMultipartHTTPService) prepareSession(r *http.Request) uploadMultipartSessionPreparedRequest {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := chi.URLParam(r, "uploadId")
	if profileID == "" || uploadID == "" {
		return uploadMultipartSessionPreparedRequest{err: uploadMultipartSessionRequiredError()}
	}

	us, ok, err := svc.server.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		return uploadMultipartSessionPreparedRequest{err: &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load upload session",
		}}
	}
	if !ok {
		return uploadMultipartSessionPreparedRequest{err: &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "upload session not found",
			details: map[string]any{"uploadId": uploadID},
		}}
	}

	return uploadMultipartSessionPreparedRequest{
		profileID: profileID,
		uploadID:  uploadID,
		us:        us,
		mode:      normalizeUploadMode(us.Mode),
	}
}

func uploadMultipartSessionExpired(us store.UploadSession) bool {
	expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt)
	if err != nil {
		return false
	}
	return time.Now().UTC().After(expiresAt)
}

func (svc uploadMultipartHTTPService) prepareComplete(r *http.Request) uploadMultipartCompletePreparedRequest {
	session := svc.prepareSession(r)
	prepared := uploadMultipartCompletePreparedRequest{session: session, err: session.err}
	if prepared.err != nil {
		return prepared
	}
	if session.mode != uploadModePresigned {
		prepared.err = &uploadHTTPError{status: http.StatusBadRequest, code: "not_supported", message: "multipart completion requires a presigned upload session"}
		return prepared
	}
	if uploadMultipartSessionExpired(session.us) {
		prepared.err = &uploadHTTPError{status: http.StatusBadRequest, code: "expired", message: "upload session expired"}
		return prepared
	}

	var req models.UploadMultipartCompleteRequest
	if err := decodeJSONWithOptions(r, &req, jsonDecodeOptions{maxBytes: uploadMultipartJSONRequestBodyMaxBytes}); err != nil {
		prepared.decodeErr = err
		return prepared
	}
	relPath := sanitizeUploadPath(req.Path)
	if relPath == "" {
		prepared.err = uploadMultipartInvalidPathError()
		return prepared
	}
	if len(req.Parts) == 0 {
		prepared.err = uploadMultipartInvalidPartsError()
		return prepared
	}

	meta, uploadErr := svc.server.loadMultipartUploadMeta(r.Context(), session.profileID, session.uploadID, relPath)
	if uploadErr != nil {
		prepared.err = uploadErr
		return prepared
	}
	client, uploadErr := svc.server.multipartClientFromContext(r.Context(), "multipart completion requires an S3-compatible provider")
	if uploadErr != nil {
		prepared.err = uploadErr
		return prepared
	}
	completed, uploadErr := buildMultipartCompletionParts(req.Parts)
	if uploadErr != nil {
		prepared.err = uploadErr
		return prepared
	}

	prepared.meta = meta
	prepared.client = client
	prepared.completed = completed
	return prepared
}

func (svc uploadMultipartHTTPService) executeComplete(r *http.Request, prepared uploadMultipartCompletePreparedRequest) (int, *uploadHTTPError, error) {
	if prepared.decodeErr != nil || prepared.err != nil {
		return 0, prepared.err, prepared.decodeErr
	}

	_, err := prepared.client.CompleteMultipartUpload(r.Context(), &s3.CompleteMultipartUploadInput{
		Bucket:   &prepared.meta.Bucket,
		Key:      &prepared.meta.ObjectKey,
		UploadId: &prepared.meta.S3UploadID,
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: prepared.completed,
		},
	})
	if err != nil {
		return 0, &uploadHTTPError{
			status:  http.StatusBadGateway,
			code:    "upload_failed",
			message: "failed to complete multipart upload",
			details: map[string]any{"error": err.Error()},
		}, nil
	}

	expectedSize := prepared.meta.FileSize
	if err := svc.server.store.UpsertUploadObject(r.Context(), store.UploadObject{
		UploadID:     prepared.session.uploadID,
		ProfileID:    prepared.session.profileID,
		Path:         prepared.meta.Path,
		Bucket:       prepared.meta.Bucket,
		ObjectKey:    prepared.meta.ObjectKey,
		ExpectedSize: &expectedSize,
	}); err != nil {
		return 0, &uploadHTTPError{status: http.StatusInternalServerError, code: "internal_error", message: "failed to persist upload object"}, nil
	}
	_ = svc.server.store.DeleteMultipartUpload(r.Context(), prepared.session.profileID, prepared.session.uploadID, prepared.meta.Path)
	return http.StatusNoContent, nil, nil
}

func (svc uploadMultipartHTTPService) prepareAbort(r *http.Request) uploadMultipartAbortPreparedRequest {
	session := svc.prepareSession(r)
	prepared := uploadMultipartAbortPreparedRequest{session: session, err: session.err}
	if prepared.err != nil {
		return prepared
	}
	if session.mode != uploadModePresigned {
		prepared.err = &uploadHTTPError{status: http.StatusBadRequest, code: "not_supported", message: "multipart abort requires a presigned upload session"}
		return prepared
	}

	var req models.UploadMultipartAbortRequest
	if err := decodeJSONWithOptions(r, &req, jsonDecodeOptions{maxBytes: uploadMultipartJSONRequestBodyMaxBytes}); err != nil {
		prepared.decodeErr = err
		return prepared
	}
	relPath := sanitizeUploadPath(req.Path)
	if relPath == "" {
		prepared.err = uploadMultipartInvalidPathError()
		return prepared
	}

	meta, uploadErr := svc.server.loadMultipartUploadMeta(r.Context(), session.profileID, session.uploadID, relPath)
	if uploadErr != nil {
		prepared.err = uploadErr
		return prepared
	}
	client, uploadErr := svc.server.multipartClientFromContext(r.Context(), "multipart abort requires an S3-compatible provider")
	if uploadErr != nil {
		prepared.err = uploadErr
		return prepared
	}

	prepared.meta = meta
	prepared.client = client
	return prepared
}

func (svc uploadMultipartHTTPService) executeAbort(r *http.Request, prepared uploadMultipartAbortPreparedRequest) (int, *uploadHTTPError, error) {
	if prepared.decodeErr != nil || prepared.err != nil {
		return 0, prepared.err, prepared.decodeErr
	}
	if err := svc.server.abortMultipartUpload(r.Context(), prepared.client, prepared.meta); err != nil {
		return 0, &uploadHTTPError{
			status:  http.StatusBadGateway,
			code:    "upload_failed",
			message: "failed to abort multipart upload",
			details: map[string]any{"error": err.Error()},
		}, nil
	}
	_ = svc.server.store.DeleteMultipartUpload(r.Context(), prepared.session.profileID, prepared.session.uploadID, prepared.meta.Path)
	return http.StatusNoContent, nil, nil
}

func (svc uploadMultipartHTTPService) prepareChunks(r *http.Request) uploadMultipartChunksPreparedRequest {
	session := svc.prepareSession(r)
	prepared := uploadMultipartChunksPreparedRequest{session: session, err: session.err}
	if prepared.err != nil {
		return prepared
	}
	if uploadMultipartSessionExpired(session.us) {
		prepared.err = &uploadHTTPError{status: http.StatusBadRequest, code: "expired", message: "upload session expired"}
		return prepared
	}
	if prepared.session.mode == "" {
		prepared.session.mode = uploadModeStaging
	}
	if prepared.session.mode != uploadModeStaging {
		query, uploadErr := parseUploadChunkQuery(r.URL.Query(), false)
		if uploadErr != nil {
			prepared.err = uploadErr
			return prepared
		}
		meta, uploadErr := svc.server.loadMultipartUploadMeta(r.Context(), session.profileID, session.uploadID, query.path)
		if uploadErr != nil {
			prepared.err = uploadErr
			return prepared
		}
		if meta.FileSize != query.fileSize || meta.ChunkSize != query.chunkSize {
			prepared.err = &uploadHTTPError{status: http.StatusNotFound, code: "not_found", message: "multipart upload not found"}
			return prepared
		}
		client, uploadErr := svc.server.multipartClientFromContext(r.Context(), "multipart status requires an S3-compatible provider")
		if uploadErr != nil {
			prepared.err = uploadErr
			return prepared
		}
		prepared.query = query
		prepared.meta = meta
		prepared.client = client
		return prepared
	}

	query, uploadErr := parseUploadChunkQuery(r.URL.Query(), true)
	if uploadErr != nil {
		prepared.err = uploadErr
		return prepared
	}
	if session.us.StagingDir == "" {
		prepared.err = &uploadHTTPError{status: http.StatusInternalServerError, code: "internal_error", message: "upload session is missing staging directory"}
		return prepared
	}
	stagingDir, err := store.ResolveUploadStagingDir(svc.server.cfg.DataDir, session.us.ID)
	if err != nil {
		prepared.err = &uploadHTTPError{status: http.StatusInternalServerError, code: "internal_error", message: "upload session has invalid staging directory", details: map[string]any{"error": err.Error()}}
		return prepared
	}
	chunkDir := filepath.Join(stagingDir, ".chunks", filepath.FromSlash(query.path))
	if !isUnderDir(stagingDir, chunkDir) {
		prepared.err = uploadMultipartInvalidFieldError("invalid upload path", map[string]any{"path": query.path})
		return prepared
	}
	prepared.query = query
	prepared.stagingDir = stagingDir
	prepared.chunkDir = chunkDir
	return prepared
}

func (svc uploadMultipartHTTPService) executeChunks(r *http.Request, prepared uploadMultipartChunksPreparedRequest) (*models.UploadChunkState, *uploadHTTPError) {
	if prepared.err != nil {
		return nil, prepared.err
	}
	if prepared.client != nil {
		parts, err := svc.server.listMultipartParts(r.Context(), prepared.client, prepared.meta)
		if err != nil {
			return nil, &uploadHTTPError{
				status:  http.StatusBadGateway,
				code:    "upload_failed",
				message: "failed to list multipart parts",
				details: map[string]any{"error": err.Error()},
			}
		}
		resp := buildRemoteMultipartChunkState(parts, prepared.meta)
		return &resp, nil
	}
	resp := buildStagingMultipartChunkState(prepared.chunkDir, prepared.query.total, prepared.query.chunkSize, prepared.query.fileSize)
	return &resp, nil
}

func (svc uploadMultipartHTTPService) executeCompleteMultipartUpload(r *http.Request) (int, *uploadHTTPError, error) {
	return svc.executeComplete(r, svc.prepareComplete(r))
}

func (svc uploadMultipartHTTPService) executeAbortMultipartUpload(r *http.Request) (int, *uploadHTTPError, error) {
	return svc.executeAbort(r, svc.prepareAbort(r))
}

func (svc uploadMultipartHTTPService) executeGetUploadChunks(r *http.Request) (*models.UploadChunkState, *uploadHTTPError) {
	return svc.executeChunks(r, svc.prepareChunks(r))
}

func (svc uploadMultipartHTTPService) handleCompleteMultipartUpload(w http.ResponseWriter, r *http.Request) {
	status, uploadErr, decodeErr := svc.executeCompleteMultipartUpload(r)
	if uploadErr != nil {
		resp := buildUploadMultipartHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &resp)
		return
	}
	if decodeErr != nil {
		writeJSONDecodeError(w, decodeErr, uploadMultipartJSONRequestBodyMaxBytes)
		return
	}
	w.WriteHeader(status)
}

func (svc uploadMultipartHTTPService) handleAbortMultipartUpload(w http.ResponseWriter, r *http.Request) {
	status, uploadErr, decodeErr := svc.executeAbortMultipartUpload(r)
	if uploadErr != nil {
		resp := buildUploadMultipartHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &resp)
		return
	}
	if decodeErr != nil {
		writeJSONDecodeError(w, decodeErr, uploadMultipartJSONRequestBodyMaxBytes)
		return
	}
	w.WriteHeader(status)
}

func (svc uploadMultipartHTTPService) handleGetUploadChunks(w http.ResponseWriter, r *http.Request) {
	resp, uploadErr := svc.executeGetUploadChunks(r)
	if uploadErr != nil {
		resp := buildUploadMultipartHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &resp)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

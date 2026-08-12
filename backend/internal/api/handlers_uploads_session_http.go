package api

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

type uploadSessionCreatePreparedRequest struct {
	profileID string
	req       models.UploadCreateRequest
	mode      string
	err       *uploadHTTPError
	decodeErr error
}

type uploadSessionDeletePreparedRequest struct {
	profileID string
	uploadID  string
	us        store.UploadSession
	mode      string
	err       *uploadHTTPError
}

type uploadSessionHTTPService struct {
	server *server
}

func newUploadSessionHTTPService(s *server) uploadSessionHTTPService {
	return uploadSessionHTTPService{server: s}
}

func (svc uploadSessionHTTPService) defaultCreateMode() string {
	if svc.server.cfg.UploadDirectStream {
		return uploadModeDirect
	}
	return uploadModeStaging
}

func (svc uploadSessionHTTPService) prepareCreateUploadSession(r *http.Request) uploadSessionCreatePreparedRequest {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		return uploadSessionCreatePreparedRequest{err: &uploadHTTPError{status: http.StatusBadRequest, code: "missing_profile", message: "X-Profile-Id header is required"}}
	}

	var req models.UploadCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		return uploadSessionCreatePreparedRequest{decodeErr: err}
	}
	req.Bucket = strings.TrimSpace(req.Bucket)
	req.Prefix = strings.TrimSpace(req.Prefix)
	if req.Bucket == "" {
		return uploadSessionCreatePreparedRequest{err: newUploadBadRequestError("bucket is required", nil)}
	}
	if uploadErr := validateUploadPrefix(req.Prefix); uploadErr != nil {
		return uploadSessionCreatePreparedRequest{err: uploadErr}
	}

	rawMode := strings.TrimSpace(req.Mode)
	mode := normalizeUploadMode(rawMode)
	if rawMode == "" {
		mode = svc.defaultCreateMode()
	}
	if mode == "" {
		return uploadSessionCreatePreparedRequest{err: newUploadBadRequestError("invalid upload mode", map[string]any{"mode": req.Mode})}
	}
	if mode == uploadModeDirect && !svc.server.cfg.UploadDirectStream {
		return uploadSessionCreatePreparedRequest{err: newUploadNotSupportedError("direct streaming uploads are disabled", nil)}
	}
	if mode == uploadModePresigned {
		secrets, ok := profileFromContext(r.Context())
		if !ok {
			return uploadSessionCreatePreparedRequest{err: newUploadInternalError("missing profile secrets", nil)}
		}
		if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			return uploadSessionCreatePreparedRequest{err: newUploadNotSupportedError("presigned uploads require an S3-compatible provider", nil)}
		}
	}

	return uploadSessionCreatePreparedRequest{profileID: profileID, req: req, mode: mode}
}

func (svc uploadSessionHTTPService) executePreparedCreate(r *http.Request, prepared uploadSessionCreatePreparedRequest) (*models.UploadCreateResponse, *uploadHTTPError, error) {
	if prepared.decodeErr != nil {
		return nil, nil, prepared.decodeErr
	}
	if prepared.err != nil {
		return nil, prepared.err, nil
	}
	expiresAt := time.Now().UTC().Add(svc.server.cfg.UploadSessionTTL).Format(time.RFC3339Nano)
	us, err := svc.server.store.CreateUploadSession(r.Context(), prepared.profileID, prepared.req.Bucket, prepared.req.Prefix, prepared.mode, "", expiresAt)
	if err != nil {
		return nil, newUploadInternalError("failed to create upload session", nil), nil
	}

	if prepared.mode == uploadModeStaging {
		stagingDir, err := store.ResolveUploadStagingDir(svc.server.cfg.DataDir, us.ID)
		if err != nil {
			return nil, svc.rollbackCreatedStagingSession(r.Context(), prepared.profileID, us.ID, "failed to prepare staging directory", err, ""), nil
		}
		if err := os.MkdirAll(stagingDir, 0o700); err != nil {
			return nil, svc.rollbackCreatedStagingSession(r.Context(), prepared.profileID, us.ID, "failed to create staging directory", err, stagingDir), nil
		}
		if err := svc.server.store.SetUploadSessionStagingDir(r.Context(), prepared.profileID, us.ID, stagingDir); err != nil {
			return nil, svc.rollbackCreatedStagingSession(r.Context(), prepared.profileID, us.ID, "failed to finalize upload session", err, stagingDir), nil
		}
	}

	return &models.UploadCreateResponse{
		UploadID:  us.ID,
		Mode:      prepared.mode,
		MaxBytes:  uploadMaxBytesResponse(svc.server.cfg.UploadMaxBytes),
		ExpiresAt: expiresAt,
	}, nil, nil
}

func (svc uploadSessionHTTPService) rollbackCreatedStagingSession(ctx context.Context, profileID, uploadID, message string, cause error, stagingDir string) *uploadHTTPError {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()

	cleanupErrs := make([]error, 0, 2)
	if stagingDir != "" {
		if err := os.RemoveAll(stagingDir); err != nil {
			cleanupErrs = append(cleanupErrs, err)
		}
	}
	if _, err := svc.server.store.DeleteUploadSession(cleanupCtx, profileID, uploadID); err != nil {
		cleanupErrs = append(cleanupErrs, err)
	}

	details := map[string]any{"error": cause.Error()}
	if cleanupErr := errors.Join(cleanupErrs...); cleanupErr != nil {
		details["cleanupError"] = cleanupErr.Error()
	}
	return newUploadInternalError(message, details)
}

func (svc uploadSessionHTTPService) prepareDeleteUploadSession(r *http.Request) uploadSessionDeletePreparedRequest {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := uploadIDFromRequest(r)
	if profileID == "" || uploadID == "" {
		return uploadSessionDeletePreparedRequest{err: newUploadBadRequestError("profile and uploadId are required", nil)}
	}

	us, ok, err := svc.server.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		return uploadSessionDeletePreparedRequest{err: newUploadInternalError("failed to load upload session", nil)}
	}
	if !ok {
		return uploadSessionDeletePreparedRequest{err: &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "upload session not found",
			details: map[string]any{"uploadId": uploadID},
		}}
	}

	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}

	return uploadSessionDeletePreparedRequest{profileID: profileID, uploadID: uploadID, us: us, mode: mode}
}

func (svc uploadSessionHTTPService) executePreparedDelete(r *http.Request, prepared uploadSessionDeletePreparedRequest) *uploadHTTPError {
	if prepared.err != nil {
		return prepared.err
	}
	if err := svc.server.abortStoredMultipartUploads(r.Context(), prepared.profileID, prepared.uploadID); err != nil {
		return newUploadInternalError("failed to abort multipart uploads", map[string]any{"error": err.Error()})
	}
	if prepared.mode == uploadModeDirect {
		secrets, ok := profileFromContext(r.Context())
		if !ok {
			return newUploadInternalError("missing profile secrets", nil)
		}
		if uploadErr := svc.cleanupDirectUploadTempPrefix(r, prepared, secrets); uploadErr != nil {
			return uploadErr
		}
	}
	if err := svc.server.store.DeleteMultipartUploadsBySession(r.Context(), prepared.profileID, prepared.uploadID); err != nil {
		return newUploadInternalError("failed to delete multipart metadata", map[string]any{"error": err.Error()})
	}

	if prepared.us.StagingDir != "" {
		stagingDir, err := store.ResolveUploadStagingDir(svc.server.cfg.DataDir, prepared.us.ID)
		if err != nil {
			return newUploadInternalError("failed to resolve staging directory", map[string]any{"error": err.Error()})
		}
		if err := os.RemoveAll(stagingDir); err != nil {
			return newUploadInternalError("failed to remove staging directory", map[string]any{"error": err.Error()})
		}
	}

	if err := svc.server.store.DeleteUploadObjectsBySession(r.Context(), prepared.profileID, prepared.uploadID); err != nil {
		return newUploadInternalError("failed to delete upload object metadata", map[string]any{"error": err.Error()})
	}
	if _, err := svc.server.store.DeleteUploadSession(r.Context(), prepared.profileID, prepared.uploadID); err != nil {
		return newUploadInternalError("failed to delete upload session", map[string]any{"error": err.Error()})
	}

	return nil
}

func (svc uploadSessionHTTPService) cleanupDirectUploadTempPrefix(r *http.Request, prepared uploadSessionDeletePreparedRequest, secrets models.ProfileSecrets) *uploadHTTPError {
	tempPrefix := directUploadTempSessionPrefix(prepared.us.Prefix, prepared.uploadID)
	target := rcloneRemoteDir(prepared.us.Bucket, tempPrefix, secrets.PreserveLeadingSlash)
	_, stderr, err := svc.server.runRcloneCapture(r.Context(), secrets, []string{"delete", target}, "upload-temp-cleanup")
	if err == nil {
		return nil
	}
	msg := redactRcloneDiagnostic(rcloneErrorMessage(err, stderr))
	return newUploadInternalError("failed to clean up upload temp objects", map[string]any{"error": msg})
}

func (svc uploadSessionHTTPService) executeCreate(r *http.Request) (*models.UploadCreateResponse, *uploadHTTPError, error) {
	return svc.executePreparedCreate(r, svc.prepareCreateUploadSession(r))
}

func (svc uploadSessionHTTPService) executeDelete(r *http.Request) *uploadHTTPError {
	return svc.executePreparedDelete(r, svc.prepareDeleteUploadSession(r))
}

func (svc uploadSessionHTTPService) handleCreateUploadSession(w http.ResponseWriter, r *http.Request) {
	resp, uploadErr, decodeErr := svc.executeCreate(r)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	if decodeErr != nil {
		writeJSONDecodeError(w, decodeErr, 0)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (svc uploadSessionHTTPService) handleDeleteUploadSession(w http.ResponseWriter, r *http.Request) {
	uploadErr := svc.executeDelete(r)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

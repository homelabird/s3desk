package api

import (
	"errors"
	"net/http"

	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

func (s *server) handlePresignedUploadCommit(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
) {
	multipartUploads, err := s.store.ListMultipartUploads(r.Context(), profileID, uploadID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart uploads", nil)
		return
	}
	if len(multipartUploads) > 0 {
		writeError(w, http.StatusBadRequest, "upload_incomplete", "multipart uploads are not finalized", nil)
		return
	}

	client, uploadErr := s.multipartClientFromContext(r.Context(), "presigned uploads require an S3-compatible provider")
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	s.writeImmediateUploadCommitResponse(w, r.Context(), profileID, uploadID, us, req, client, multipartUploads)
}

func (s *server) handleDirectUploadCommit(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
		return
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		writeError(w, http.StatusBadRequest, "not_supported", "direct streaming multipart uploads require an S3-compatible provider", nil)
		return
	}
	client, err := s3ClientFromProfile(secrets)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
		return
	}

	multipartUploads, err := s.store.ListMultipartUploads(r.Context(), profileID, uploadID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart uploads", nil)
		return
	}

	if len(multipartUploads) > 0 {
		if err := s.completeDirectMultipartUploads(r.Context(), profileID, client, multipartUploads); err != nil {
			var uploadErr *uploadHTTPError
			if errors.As(err, &uploadErr) {
				writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
				return
			}
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to finalize multipart upload", nil)
			return
		}
	}
	s.writeImmediateUploadCommitResponse(w, r.Context(), profileID, uploadID, us, req, client, multipartUploads)
}

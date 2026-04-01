package api

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

func (s *server) handleCreateUpload(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	var req models.UploadCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSONDecodeError(w, err, 0)
		return
	}
	req.Bucket = strings.TrimSpace(req.Bucket)
	req.Prefix = strings.TrimSpace(req.Prefix)
	if req.Bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	mode := normalizeUploadMode(req.Mode)
	if mode == "" {
		if s.cfg.UploadDirectStream {
			mode = uploadModeDirect
		} else {
			mode = uploadModeStaging
		}
	}
	switch mode {
	case uploadModeStaging, uploadModeDirect, uploadModePresigned:
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid upload mode", map[string]any{"mode": req.Mode})
		return
	}
	if mode == uploadModeDirect && !s.cfg.UploadDirectStream {
		writeError(w, http.StatusBadRequest, "not_supported", "direct streaming uploads are disabled", nil)
		return
	}
	if mode == uploadModePresigned {
		secrets, ok := profileFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
			return
		}
		if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			writeError(w, http.StatusBadRequest, "not_supported", "presigned uploads require an S3-compatible provider", nil)
			return
		}
	}

	expiresAt := time.Now().UTC().Add(s.cfg.UploadSessionTTL).Format(time.RFC3339Nano)
	us, err := s.store.CreateUploadSession(r.Context(), profileID, req.Bucket, req.Prefix, mode, "", expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create upload session", nil)
		return
	}

	if mode == uploadModeStaging {
		stagingDir, err := store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID)
		if err != nil {
			_, _ = s.store.DeleteUploadSession(r.Context(), profileID, us.ID)
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare staging directory", map[string]any{"error": err.Error()})
			return
		}
		if err := os.MkdirAll(stagingDir, 0o700); err != nil {
			_, _ = s.store.DeleteUploadSession(r.Context(), profileID, us.ID)
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to create staging directory", nil)
			return
		}
		if err := s.store.SetUploadSessionStagingDir(r.Context(), profileID, us.ID, stagingDir); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to finalize upload session", nil)
			return
		}
	}

	maxBytes := uploadMaxBytesResponse(s.cfg.UploadMaxBytes)

	writeJSON(w, http.StatusCreated, models.UploadCreateResponse{
		UploadID:  us.ID,
		Mode:      mode,
		MaxBytes:  maxBytes,
		ExpiresAt: expiresAt,
	})
}

func (s *server) handleDeleteUpload(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := chi.URLParam(r, "uploadId")
	if profileID == "" || uploadID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and uploadId are required", nil)
		return
	}

	us, ok, err := s.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load upload session", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "upload session not found", map[string]any{"uploadId": uploadID})
		return
	}

	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode != uploadModeStaging {
		secrets, ok := profileFromContext(r.Context())
		if ok && rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			if client, err := s3ClientFromProfile(secrets); err == nil {
				if uploads, err := s.store.ListMultipartUploads(r.Context(), profileID, uploadID); err == nil {
					for _, meta := range uploads {
						_ = s.abortMultipartUpload(r.Context(), client, meta)
					}
				}
			}
		}
		_ = s.store.DeleteMultipartUploadsBySession(r.Context(), profileID, uploadID)
	}

	_ = s.store.DeleteUploadObjectsBySession(r.Context(), profileID, uploadID)
	_, _ = s.store.DeleteUploadSession(r.Context(), profileID, uploadID)
	if us.StagingDir != "" {
		if stagingDir, err := store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID); err == nil {
			_ = os.RemoveAll(stagingDir)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

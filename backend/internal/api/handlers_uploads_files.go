package api

import (
	"net/http"
	"time"
	"s3desk/internal/store"
)

func (s *server) loadWritableUploadSession(
	w http.ResponseWriter,
	r *http.Request,
	us store.UploadSession,
) (string, string, bool) {
	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode == uploadModePresigned {
		writeError(w, http.StatusBadRequest, "not_supported", "presigned uploads do not accept file bodies", nil)
		return "", "", false
	}
	if mode == uploadModeDirect && !s.cfg.UploadDirectStream {
		writeError(w, http.StatusBadRequest, "not_supported", "direct streaming uploads are disabled", nil)
		return "", "", false
	}
	if mode == uploadModeStaging && us.StagingDir == "" {
		writeError(w, http.StatusInternalServerError, "internal_error", "upload session is missing staging directory", nil)
		return "", "", false
	}

	stagingDir := ""
	if mode == uploadModeStaging {
		resolved, err := store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "upload session has invalid staging directory", map[string]any{"error": err.Error()})
			return "", "", false
		}
		stagingDir = resolved
	}

	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil && time.Now().UTC().After(expiresAt) {
		writeError(w, http.StatusBadRequest, "expired", "upload session expired", nil)
		return "", "", false
	}

	return mode, stagingDir, true
}

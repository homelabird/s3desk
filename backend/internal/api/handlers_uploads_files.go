package api

import (
	"net/http"
	"s3desk/internal/store"
	"time"
)

func (s *server) loadWritableUploadSession(us store.UploadSession) (string, string, *uploadHTTPError) {
	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode == uploadModePresigned {
		return "", "", newUploadNotSupportedError("presigned uploads do not accept file bodies", nil)
	}
	if mode == uploadModeDirect && !s.cfg.UploadDirectStream {
		return "", "", newUploadNotSupportedError("direct streaming uploads are disabled", nil)
	}
	if mode == uploadModeStaging && us.StagingDir == "" {
		return "", "", newUploadInternalError("upload session is missing staging directory", nil)
	}

	stagingDir := ""
	if mode == uploadModeStaging {
		resolved, err := store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID)
		if err != nil {
			return "", "", newUploadInternalError("upload session has invalid staging directory", map[string]any{"error": err.Error()})
		}
		stagingDir = resolved
	}

	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil && time.Now().UTC().After(expiresAt) {
		return "", "", &uploadHTTPError{status: http.StatusBadRequest, code: "expired", message: "upload session expired"}
	}

	return mode, stagingDir, nil
}

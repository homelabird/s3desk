package api

import (
	"net/http"
	"time"

	"s3desk/internal/store"
)

type uploadCommitSession struct {
	profileID string
	uploadID  string
	us        store.UploadSession
	mode      string
}

type uploadCommitRequestService struct {
	server *server
}

func newUploadCommitRequestService(s *server) uploadCommitRequestService {
	return uploadCommitRequestService{server: s}
}

func (svc uploadCommitRequestService) prepare(r *http.Request) (uploadCommitSession, uploadCommitRequest, *uploadHTTPError, error) {
	session, uploadErr := svc.loadSession(r)
	if uploadErr != nil {
		return uploadCommitSession{}, uploadCommitRequest{}, uploadErr, nil
	}
	req, err := svc.decode(r)
	if err != nil {
		return session, uploadCommitRequest{}, nil, err
	}
	return session, req, nil, nil
}

func (svc uploadCommitRequestService) loadSession(r *http.Request) (uploadCommitSession, *uploadHTTPError) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := uploadIDFromRequest(r)
	if profileID == "" || uploadID == "" {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "profile and uploadId are required",
		}
	}

	us, ok, err := svc.server.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load upload session",
		}
	}
	if !ok {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "upload session not found",
			details: map[string]any{"uploadId": uploadID},
		}
	}
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil && time.Now().UTC().After(expiresAt) {
		return uploadCommitSession{}, &uploadHTTPError{status: http.StatusBadRequest, code: "expired", message: "upload session expired"}
	}

	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode == uploadModeDirect && !svc.server.cfg.UploadDirectStream {
		return uploadCommitSession{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "not_supported",
			message: "direct streaming uploads are disabled",
		}
	}

	return uploadCommitSession{
		profileID: profileID,
		uploadID:  uploadID,
		us:        us,
		mode:      mode,
	}, nil
}

func (svc uploadCommitRequestService) decode(r *http.Request) (uploadCommitRequest, error) {
	var req uploadCommitRequest
	if err := decodeJSONWithOptions(r, &req, jsonDecodeOptions{
		maxBytes:   uploadCommitJSONRequestBodyMaxBytes,
		allowEmpty: true,
	}); err != nil {
		return uploadCommitRequest{}, err
	}
	return req, nil
}

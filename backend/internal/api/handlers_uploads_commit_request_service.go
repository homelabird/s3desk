package api

import (
	"net/http"

	"s3desk/internal/store"
)

type uploadCommitSession struct {
	profileID string
	uploadID  string
	us        store.UploadSession
	mode      string
}

type uploadCommitPreparedRequest struct {
	session   uploadCommitSession
	req       uploadCommitRequest
	decodeErr error
	err       *uploadHTTPError
}

type uploadCommitRequestService struct {
	server *server
}

func newUploadCommitRequestService(s *server) uploadCommitRequestService {
	return uploadCommitRequestService{server: s}
}

func (svc uploadCommitRequestService) prepare(r *http.Request) uploadCommitPreparedRequest {
	session, uploadErr := svc.loadSession(r)
	if uploadErr != nil {
		return uploadCommitPreparedRequest{err: uploadErr}
	}
	req, err := svc.decode(r)
	if err != nil {
		return uploadCommitPreparedRequest{session: session, decodeErr: err}
	}
	return uploadCommitPreparedRequest{session: session, req: req}
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

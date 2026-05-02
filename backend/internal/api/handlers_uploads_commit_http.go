package api

import (
	"net/http"

	"s3desk/internal/models"
)

type uploadCommitHTTPService struct {
	server *server
}

func newUploadCommitHTTPService(s *server) uploadCommitHTTPService {
	return uploadCommitHTTPService{server: s}
}

func buildUploadCommitHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc uploadCommitHTTPService) executeCommit(r *http.Request) (*models.JobCreatedResponse, *uploadHTTPError, error) {
	session, req, uploadErr, decodeErr := newUploadCommitRequestService(svc.server).prepare(r)
	if uploadErr != nil {
		return nil, uploadErr, nil
	}
	if decodeErr != nil {
		return nil, nil, decodeErr
	}

	resp, uploadErr := newUploadCommitExecutionService(svc.server).execute(r.Context(), session, req)
	if uploadErr != nil {
		return nil, uploadErr, nil
	}
	return &resp, nil, nil
}

func (svc uploadCommitHTTPService) handleCommitUpload(w http.ResponseWriter, r *http.Request) {
	resp, uploadErr, decodeErr := svc.executeCommit(r)
	if uploadErr != nil {
		if uploadErr.code == "job_queue_full" {
			w.Header().Set("Retry-After", "2")
		}
		errResp := buildUploadCommitHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &errResp)
		return
	}
	if decodeErr != nil {
		writeJSONDecodeError(w, decodeErr, uploadCommitJSONRequestBodyMaxBytes)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

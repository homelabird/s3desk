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

func (svc uploadCommitHTTPService) prepareCommit(r *http.Request) uploadCommitPreparedRequest {
	return newUploadCommitRequestService(svc.server).prepare(r)
}

func (svc uploadCommitHTTPService) executePrepared(r *http.Request, prepared uploadCommitPreparedRequest) (*models.JobCreatedResponse, error, *uploadHTTPError) {
	if prepared.decodeErr != nil {
		return nil, prepared.decodeErr, nil
	}
	if prepared.err != nil {
		return nil, nil, prepared.err
	}

	resp, uploadErr := svc.server.executeUploadCommit(r.Context(), prepared.session, prepared.req)
	if uploadErr != nil {
		return nil, nil, uploadErr
	}
	return &resp, nil, nil
}

func (svc uploadCommitHTTPService) executeCommit(r *http.Request) (*models.JobCreatedResponse, error, *uploadHTTPError) {
	return svc.executePrepared(r, svc.prepareCommit(r))
}

func (svc uploadCommitHTTPService) handleCommitUpload(w http.ResponseWriter, r *http.Request) {
	resp, decodeErr, uploadErr := svc.executeCommit(r)
	if decodeErr != nil {
		writeJSONDecodeError(w, decodeErr, uploadCommitJSONRequestBodyMaxBytes)
		return
	}
	if uploadErr != nil {
		if uploadErr.code == "job_queue_full" {
			w.Header().Set("Retry-After", "2")
		}
		errResp := buildUploadCommitHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &errResp)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

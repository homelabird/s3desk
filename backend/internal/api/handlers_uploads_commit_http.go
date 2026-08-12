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
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	if decodeErr != nil {
		writeJSONDecodeError(w, decodeErr, uploadCommitJSONRequestBodyMaxBytes)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

package api

import (
	"errors"
	"net/http"
	"strconv"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type jobListPreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type jobListPreparedRequest struct {
	profileID string
	filter    store.JobFilter
	err       error
}

type jobListHTTPService struct {
	server *server
}

func (e *jobListPreparationError) Error() string {
	return e.message
}

func newJobListPreparationError(status int, code, message string, details map[string]any) *jobListPreparationError {
	return &jobListPreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func buildJobListFilter(r *http.Request) (store.JobFilter, error) {
	var filter store.JobFilter

	if status := r.URL.Query().Get("status"); status != "" {
		js := models.JobStatus(status)
		filter.Status = &js
	}
	if t := r.URL.Query().Get("type"); t != "" {
		filter.Type = &t
	}
	if ec := r.URL.Query().Get("errorCode"); ec != "" {
		filter.ErrorCode = &ec
	}

	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		} else {
			return store.JobFilter{}, newJobListPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"limit is invalid",
				map[string]any{"limit": raw},
			)
		}
	}
	filter.Limit = limit

	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		filter.Cursor = &cursor
	}

	return filter, nil
}

func extractJobListPreparedRequest(r *http.Request) jobListPreparedRequest {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		return jobListPreparedRequest{
			err: newJobListPreparationError(
				http.StatusBadRequest,
				"missing_profile",
				"X-Profile-Id header is required",
				nil,
			),
		}
	}
	filter, err := buildJobListFilter(r)
	if err != nil {
		return jobListPreparedRequest{err: err}
	}

	return jobListPreparedRequest{
		profileID: profileID,
		filter:    filter,
	}
}

func newJobListHTTPService(s *server) jobListHTTPService {
	return jobListHTTPService{server: s}
}

func (svc jobListHTTPService) prepareListJobs(r *http.Request) jobListPreparedRequest {
	return extractJobListPreparedRequest(r)
}

func (svc jobListHTTPService) executePrepared(r *http.Request, prepared jobListPreparedRequest) (models.JobsListResponse, error) {
	if prepared.err != nil {
		return models.JobsListResponse{}, prepared.err
	}

	resp, err := svc.server.store.ListJobs(r.Context(), prepared.profileID, prepared.filter)
	if err != nil {
		return models.JobsListResponse{}, err
	}
	return resp, nil
}

func (svc jobListHTTPService) executeListJobs(r *http.Request) (models.JobsListResponse, error) {
	return svc.executePrepared(r, svc.prepareListJobs(r))
}

func (svc jobListHTTPService) handleListJobs(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeListJobs(r)
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var prepErr *jobListPreparationError
	if errors.As(err, &prepErr) {
		resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
		writeJSON(w, prepErr.status, resp)
		return
	}

	respErr := buildAPIErrorResponse("internal_error", "failed to list jobs", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

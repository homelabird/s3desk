package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

func (e *jobRequestPreparationError) Error() string {
	return e.message
}

type jobRequestPreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type jobRequestInput struct {
	profileID string
	jobID     string
	err       error
}

type jobRequest struct {
	profileID string
	jobID     string
	job       models.Job
}

func newJobRequestPreparationError(status int, code, message string, details map[string]any) *jobRequestPreparationError {
	return &jobRequestPreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func writeJobRequestPreparationFailure(w http.ResponseWriter, err error) bool {
	var prepErr *jobRequestPreparationError
	if !errors.As(err, &prepErr) {
		return false
	}
	writeError(w, prepErr.status, prepErr.code, prepErr.message, prepErr.details)
	return true
}

func extractJobRequest(r *http.Request) jobRequestInput {
	profileID := r.Header.Get("X-Profile-Id")
	jobID := chi.URLParam(r, "jobId")
	if profileID == "" || jobID == "" {
		return jobRequestInput{
			err: newJobRequestPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"profile and jobId are required",
				nil,
			),
		}
	}
	return jobRequestInput{
		profileID: profileID,
		jobID:     jobID,
	}
}

func (s *server) prepareJobRequest(ctx context.Context, r *http.Request) (jobRequest, error) {
	requestInput := extractJobRequest(r)
	if requestInput.err != nil {
		return jobRequest{}, requestInput.err
	}

	job, ok, err := s.store.GetJob(ctx, requestInput.profileID, requestInput.jobID)
	if err != nil {
		return jobRequest{}, newJobRequestPreparationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to load job",
			nil,
		)
	}
	if !ok {
		return jobRequest{}, newJobRequestPreparationError(
			http.StatusNotFound,
			"not_found",
			"job not found",
			map[string]any{"jobId": requestInput.jobID},
		)
	}

	return jobRequest{
		profileID: requestInput.profileID,
		jobID:     requestInput.jobID,
		job:       job,
	}, nil
}

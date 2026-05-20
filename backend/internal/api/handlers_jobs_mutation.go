package api

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/ws"
)

type jobMutationHTTPService struct {
	server *server
}

type jobMutationKind string

type jobMutationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

const (
	jobMutationDelete jobMutationKind = "delete"
	jobMutationCancel jobMutationKind = "cancel"
)

type jobMutationPreparedRequest struct {
	kind    jobMutationKind
	request jobRequest
}

func (e *jobMutationError) Error() string {
	return e.message
}

func newJobMutationHTTPService(s *server) jobMutationHTTPService {
	return jobMutationHTTPService{server: s}
}

func newJobMutationError(status int, code, message string, details map[string]any) *jobMutationError {
	return &jobMutationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func writeJobMutationFailure(w http.ResponseWriter, err error) bool {
	var mutationErr *jobMutationError
	if !errors.As(err, &mutationErr) {
		return false
	}
	writeError(w, mutationErr.status, mutationErr.code, mutationErr.message, mutationErr.details)
	return true
}

func writeJobMutationServiceFailure(w http.ResponseWriter, err error) {
	if writeJobRequestPreparationFailure(w, err) || writeJobMutationFailure(w, err) {
		return
	}
	writeError(w, http.StatusInternalServerError, "internal_error", "failed to mutate job", nil)
}

func (svc jobMutationHTTPService) handleDeleteJob(w http.ResponseWriter, r *http.Request) {
	if err := svc.executeDelete(r); err != nil {
		writeJobMutationServiceFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (svc jobMutationHTTPService) handleCancelJob(w http.ResponseWriter, r *http.Request) {
	job, err := svc.executeCancel(r)
	if err != nil {
		writeJobMutationServiceFailure(w, err)
		return
	}
	writeJSON(w, http.StatusOK, &job)
}

func (svc jobMutationHTTPService) prepareDeleteJob(r *http.Request) (jobMutationPreparedRequest, error) {
	request, err := svc.server.prepareJobRequest(r.Context(), r)
	if err != nil {
		return jobMutationPreparedRequest{}, err
	}
	switch request.job.Status {
	case models.JobStatusQueued, models.JobStatusRunning:
		return jobMutationPreparedRequest{}, newJobMutationError(
			http.StatusConflict,
			"conflict",
			"cannot delete an active job; cancel it first",
			map[string]any{"status": request.job.Status},
		)
	}
	return jobMutationPreparedRequest{
		kind:    jobMutationDelete,
		request: request,
	}, nil
}

func (svc jobMutationHTTPService) prepareCancelJob(r *http.Request) (jobMutationPreparedRequest, error) {
	request, err := svc.server.prepareJobRequest(r.Context(), r)
	if err != nil {
		return jobMutationPreparedRequest{}, err
	}
	switch request.job.Status {
	case models.JobStatusQueued, models.JobStatusRunning:
		// ok
	default:
		return jobMutationPreparedRequest{}, newJobMutationError(
			http.StatusBadRequest,
			"invalid_request",
			"job is not cancelable (only queued/running)",
			map[string]any{"status": request.job.Status},
		)
	}
	return jobMutationPreparedRequest{
		kind:    jobMutationCancel,
		request: request,
	}, nil
}

func (svc jobMutationHTTPService) executeDelete(r *http.Request) error {
	prepared, err := svc.prepareDeleteJob(r)
	if err != nil {
		return err
	}
	return svc.executeDeletePrepared(r.Context(), prepared.request)
}

func (svc jobMutationHTTPService) executeCancel(r *http.Request) (models.Job, error) {
	prepared, err := svc.prepareCancelJob(r)
	if err != nil {
		return models.Job{}, err
	}
	return svc.executeCancelPrepared(r.Context(), prepared.request)
}

func (svc jobMutationHTTPService) executeDeletePrepared(ctx context.Context, request jobRequest) error {
	deleted, err := svc.server.store.DeleteJob(ctx, request.profileID, request.jobID)
	if err != nil {
		return newJobMutationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to delete job",
			nil,
		)
	}
	if !deleted {
		return newJobMutationError(
			http.StatusNotFound,
			"not_found",
			"job not found",
			map[string]any{"jobId": request.jobID},
		)
	}

	removeDeletedJobArtifacts(svc.server.cfg.DataDir, request.jobID)
	svc.server.hub.Publish(ws.Event{Type: "jobs.deleted", Payload: map[string]any{"jobIds": []string{request.jobID}, "reason": "manual"}})
	return nil
}

func (svc jobMutationHTTPService) executeCancelPrepared(ctx context.Context, request jobRequest) (models.Job, error) {
	responseJob := request.job
	switch request.job.Status {
	case models.JobStatusQueued:
		finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
		code := jobs.ErrorCodeCanceled
		updated, err := svc.server.store.UpdateJobStatusIfCurrent(ctx, request.jobID, []models.JobStatus{models.JobStatusQueued}, models.JobStatusCanceled, nil, &finishedAt, nil, nil, &code)
		if err != nil {
			return models.Job{}, newJobMutationError(
				http.StatusInternalServerError,
				"internal_error",
				"failed to update job",
				nil,
			)
		}
		if !updated {
			current, ok, err := svc.server.store.GetJob(ctx, request.profileID, request.jobID)
			if err != nil {
				return models.Job{}, newJobMutationError(
					http.StatusInternalServerError,
					"internal_error",
					"failed to load job",
					nil,
				)
			}
			if !ok {
				return models.Job{}, newJobMutationError(
					http.StatusNotFound,
					"not_found",
					"job not found",
					map[string]any{"jobId": request.jobID},
				)
			}
			if current.Status == models.JobStatusRunning {
				svc.server.jobs.Cancel(request.jobID)
				return current, nil
			}
			return models.Job{}, newJobMutationError(
				http.StatusConflict,
				"conflict",
				"job status changed before it could be canceled",
				map[string]any{"status": current.Status},
			)
		}
		svc.server.jobs.Cancel(request.jobID)
		payload := map[string]any{"status": models.JobStatusCanceled, "errorCode": code}
		svc.server.hub.Publish(ws.Event{Type: "job.completed", JobID: request.jobID, Payload: payload})
		responseJob.Status = models.JobStatusCanceled
		responseJob.FinishedAt = &finishedAt
		responseJob.ErrorCode = &code
	case models.JobStatusRunning:
		svc.server.jobs.Cancel(request.jobID)
		updated, ok, err := svc.server.store.GetJob(ctx, request.profileID, request.jobID)
		if err != nil {
			return models.Job{}, newJobMutationError(
				http.StatusInternalServerError,
				"internal_error",
				"failed to load job",
				nil,
			)
		}
		if !ok {
			return models.Job{}, newJobMutationError(
				http.StatusNotFound,
				"not_found",
				"job not found",
				map[string]any{"jobId": request.jobID},
			)
		}
		responseJob = updated
	default:
		return models.Job{}, newJobMutationError(
			http.StatusBadRequest,
			"invalid_request",
			"job is not cancelable (only queued/running)",
			map[string]any{"status": request.job.Status},
		)
	}

	return responseJob, nil
}

func removeDeletedJobArtifacts(dataDir, jobID string) {
	if !isSafeJobResourceID(jobID) {
		return
	}
	_ = os.Remove(filepath.Join(dataDir, "logs", "jobs", jobID+".log"))
	_ = os.Remove(filepath.Join(dataDir, "logs", "jobs", jobID+".cmd"))
	_ = os.Remove(filepath.Join(dataDir, "artifacts", "jobs", jobID+".zip"))
	_ = os.Remove(filepath.Join(dataDir, "artifacts", "jobs", jobID+".zip.tmp"))
}

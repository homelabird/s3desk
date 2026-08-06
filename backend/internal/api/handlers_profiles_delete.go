package api

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type profileDeletePreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type profileDeletePreparedRequest struct {
	profileID string
	err       error
}

type profileDeleteHTTPService struct {
	server *server
}

func (e *profileDeletePreparationError) Error() string {
	return e.message
}

func newProfileDeletePreparationError(status int, code, message string, details map[string]any) *profileDeletePreparationError {
	return &profileDeletePreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func newProfileDeleteHTTPService(s *server) profileDeleteHTTPService {
	return profileDeleteHTTPService{server: s}
}

func (svc profileDeleteHTTPService) prepareDeleteProfile(r *http.Request) profileDeletePreparedRequest {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		return profileDeletePreparedRequest{
			err: newProfileDeletePreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"profileId is required",
				nil,
			),
		}
	}
	return profileDeletePreparedRequest{profileID: profileID}
}

func (svc profileDeleteHTTPService) cancelRunningJobs(ctx context.Context, profileID string) {
	if svc.server.jobs == nil {
		return
	}
	runningIDs, err := svc.server.store.ListJobIDsByProfileAndStatus(ctx, profileID, models.JobStatusRunning)
	if err != nil {
		return
	}
	for _, id := range runningIDs {
		svc.server.jobs.Cancel(id)
	}
}

func (svc profileDeleteHTTPService) removeJobLogs(ctx context.Context, profileID string) {
	jobIDs, err := svc.server.store.ListJobIDsByProfile(ctx, profileID)
	if err != nil {
		return
	}
	for _, id := range jobIDs {
		_ = os.Remove(filepath.Join(svc.server.cfg.DataDir, "logs", "jobs", id+".log"))
	}
}

func (svc profileDeleteHTTPService) removeUploadStagingDirs(ctx context.Context, profileID string) {
	sessions, err := svc.server.store.ListUploadSessionsByProfile(ctx, profileID, 10_000)
	if err != nil {
		return
	}
	for _, us := range sessions {
		if us.StagingDir == "" {
			continue
		}
		stagingDir, err := store.ResolveUploadStagingDir(svc.server.cfg.DataDir, us.ID)
		if err != nil {
			continue
		}
		_ = os.RemoveAll(stagingDir)
	}
}

func (svc profileDeleteHTTPService) executePrepared(ctx context.Context, prepared profileDeletePreparedRequest) error {
	if prepared.err != nil {
		return prepared.err
	}

	svc.cancelRunningJobs(ctx, prepared.profileID)
	svc.removeJobLogs(ctx, prepared.profileID)
	svc.removeUploadStagingDirs(ctx, prepared.profileID)

	ok, err := svc.server.store.DeleteProfile(ctx, prepared.profileID)
	if err != nil {
		return newProfileDeletePreparationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to delete profile",
			nil,
		)
	}
	if !ok {
		return newProfileDeletePreparationError(
			http.StatusNotFound,
			"not_found",
			"profile not found",
			map[string]any{"profileId": prepared.profileID},
		)
	}

	return nil
}

func (svc profileDeleteHTTPService) executeDelete(r *http.Request) error {
	return svc.executePrepared(r.Context(), svc.prepareDeleteProfile(r))
}

func (svc profileDeleteHTTPService) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	err := svc.executeDelete(r)
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var prepErr *profileDeletePreparationError
	if errors.As(err, &prepErr) {
		resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
		writeJSON(w, prepErr.status, &resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to delete profile", nil)
	writeJSON(w, http.StatusInternalServerError, &resp)
}

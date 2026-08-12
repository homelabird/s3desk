package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

const (
	profileDeleteJobDrainTimeout       = 10 * time.Second
	profileDeleteJobPollInterval       = 25 * time.Millisecond
	profileDeleteUploadSessionPageSize = 200
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

func (svc profileDeleteHTTPService) cancelAndWaitForJobs(ctx context.Context, profileID string) error {
	for {
		queuedIDs, err := svc.server.store.ListJobIDsByProfileAndStatus(ctx, profileID, models.JobStatusQueued)
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return newProfileDeletePreparationError(
					http.StatusConflict,
					"conflict",
					"profile has active jobs; cancel them before deleting the profile",
					nil,
				)
			}
			return newProfileDeletePreparationError(
				http.StatusInternalServerError,
				"internal_error",
				"failed to inspect profile jobs",
				map[string]any{"error": err.Error()},
			)
		}
		runningIDs, err := svc.server.store.ListJobIDsByProfileAndStatus(ctx, profileID, models.JobStatusRunning)
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return newProfileDeletePreparationError(
					http.StatusConflict,
					"conflict",
					"profile has active jobs; cancel them before deleting the profile",
					nil,
				)
			}
			return newProfileDeletePreparationError(
				http.StatusInternalServerError,
				"internal_error",
				"failed to inspect profile jobs",
				map[string]any{"error": err.Error()},
			)
		}
		if len(queuedIDs) == 0 && len(runningIDs) == 0 {
			return nil
		}

		finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
		code := jobs.ErrorCodeCanceled
		for _, id := range queuedIDs {
			_, err := svc.server.store.UpdateJobStatusIfCurrent(
				ctx,
				id,
				[]models.JobStatus{models.JobStatusQueued},
				models.JobStatusCanceled,
				nil,
				&finishedAt,
				nil,
				nil,
				&code,
			)
			if err != nil {
				return newProfileDeletePreparationError(
					http.StatusInternalServerError,
					"internal_error",
					"failed to cancel profile job",
					map[string]any{"error": err.Error()},
				)
			}
			if svc.server.jobs != nil {
				svc.server.jobs.Cancel(id)
			}
		}
		if svc.server.jobs != nil {
			for _, id := range runningIDs {
				svc.server.jobs.Cancel(id)
			}
		}

		select {
		case <-ctx.Done():
			return newProfileDeletePreparationError(
				http.StatusConflict,
				"conflict",
				"profile has active jobs; cancel them before deleting the profile",
				map[string]any{"activeJobCount": len(queuedIDs) + len(runningIDs)},
			)
		case <-time.After(profileDeleteJobPollInterval):
		}
	}
}

func (svc profileDeleteHTTPService) drainProfileJobs(ctx context.Context, profileID string) error {
	drainCtx, cancel := context.WithTimeout(ctx, profileDeleteJobDrainTimeout)
	defer cancel()
	return svc.cancelAndWaitForJobs(drainCtx, profileID)
}

func (svc profileDeleteHTTPService) removeJobArtifacts(ctx context.Context, profileID string) {
	jobIDs, err := svc.server.store.ListJobIDsByProfile(ctx, profileID)
	if err != nil {
		return
	}
	for _, id := range jobIDs {
		removeDeletedJobArtifacts(svc.server.cfg.DataDir, id)
	}
}

func (svc profileDeleteHTTPService) cleanupUploadSessions(ctx context.Context, profileID string) error {
	var secrets models.ProfileSecrets
	secretsLoaded := false
	loadSecrets := func() error {
		if secretsLoaded {
			return nil
		}
		var ok bool
		var err error
		secrets, ok, err = svc.server.store.GetProfileSecrets(ctx, profileID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("profile %q not found for upload cleanup", profileID)
		}
		secretsLoaded = true
		return nil
	}

	for {
		sessions, err := svc.server.store.ListUploadSessionsByProfile(ctx, profileID, profileDeleteUploadSessionPageSize)
		if err != nil {
			return err
		}
		if len(sessions) == 0 {
			return nil
		}

		for _, us := range sessions {
			mode := normalizeUploadMode(us.Mode)
			if mode == "" {
				mode = uploadModeStaging
			}
			if err := svc.server.abortStoredMultipartUploads(ctx, profileID, us.ID); err != nil {
				return err
			}
			if mode == uploadModeDirect {
				if err := loadSecrets(); err != nil {
					return err
				}
				tempPrefix := directUploadTempSessionPrefix(us.Prefix, us.ID)
				target := rcloneRemoteDir(us.Bucket, tempPrefix, secrets.PreserveLeadingSlash)
				_, stderr, err := svc.server.runRcloneCapture(ctx, secrets, []string{"delete", target}, "upload-temp-cleanup")
				if err != nil {
					return fmt.Errorf("cleanup upload temp objects: %s", redactRcloneDiagnostic(rcloneErrorMessage(err, stderr)))
				}
			}
			if us.StagingDir != "" {
				stagingDir, err := store.ResolveUploadStagingDir(svc.server.cfg.DataDir, us.ID)
				if err != nil {
					return err
				}
				if err := os.RemoveAll(stagingDir); err != nil {
					return err
				}
			}
			if err := svc.server.store.DeleteMultipartUploadsBySession(ctx, profileID, us.ID); err != nil {
				return err
			}
			if err := svc.server.store.DeleteUploadObjectsBySession(ctx, profileID, us.ID); err != nil {
				return err
			}
			if _, err := svc.server.store.DeleteUploadSession(ctx, profileID, us.ID); err != nil {
				return err
			}
		}
	}
}

func (svc profileDeleteHTTPService) executePrepared(ctx context.Context, prepared profileDeletePreparedRequest) error {
	if prepared.err != nil {
		return prepared.err
	}

	if err := svc.drainProfileJobs(ctx, prepared.profileID); err != nil {
		return err
	}
	if err := svc.cleanupUploadSessions(ctx, prepared.profileID); err != nil {
		return newProfileDeletePreparationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to clean up upload sessions",
			map[string]any{"error": err.Error()},
		)
	}
	if err := svc.drainProfileJobs(ctx, prepared.profileID); err != nil {
		return err
	}
	svc.removeJobArtifacts(ctx, prepared.profileID)

	ok, err := svc.server.store.DeleteProfile(ctx, prepared.profileID)
	if errors.Is(err, store.ErrProfileHasActiveJobs) {
		return newProfileDeletePreparationError(
			http.StatusConflict,
			"conflict",
			"profile has active jobs; cancel them before deleting the profile",
			nil,
		)
	}
	if errors.Is(err, store.ErrProfileHasActiveUploadSessions) {
		return newProfileDeletePreparationError(
			http.StatusConflict,
			"conflict",
			"profile has active upload sessions; retry deletion after cleanup",
			nil,
		)
	}
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

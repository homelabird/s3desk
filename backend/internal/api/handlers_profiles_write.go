package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type profileWriteKind string

const (
	profileWriteCreate profileWriteKind = "create"
	profileWriteUpdate profileWriteKind = "update"
)

type profileWritePreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type profileWritePreparedRequest struct {
	kind      profileWriteKind
	profileID string
	createReq models.ProfileCreateRequest
	updateReq models.ProfileUpdateRequest
	decodeErr error
	err       error
}

type profileWriteHTTPService struct {
	server *server
}

func (e *profileWritePreparationError) Error() string {
	return e.message
}

func newProfileWritePreparationError(status int, code, message string, details map[string]any) *profileWritePreparationError {
	return &profileWritePreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func newProfileWriteHTTPService(s *server) profileWriteHTTPService {
	return profileWriteHTTPService{server: s}
}

func (svc profileWriteHTTPService) prepareCreateProfile(r *http.Request) profileWritePreparedRequest {
	var req models.ProfileCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		return profileWritePreparedRequest{
			kind:      profileWriteCreate,
			decodeErr: err,
		}
	}
	req, err := prepareCreateProfileRequest(req, svc.server.cfg.AllowRemote)
	if err != nil {
		return profileWritePreparedRequest{
			kind: profileWriteCreate,
			err: newProfileWritePreparationError(
				http.StatusBadRequest,
				"invalid_request",
				err.Error(),
				nil,
			),
		}
	}
	return profileWritePreparedRequest{
		kind:      profileWriteCreate,
		createReq: req,
	}
}

func (svc profileWriteHTTPService) prepareUpdateProfile(r *http.Request) profileWritePreparedRequest {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		return profileWritePreparedRequest{
			kind: profileWriteUpdate,
			err: newProfileWritePreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"profileId is required",
				nil,
			),
		}
	}

	var req models.ProfileUpdateRequest
	if err := decodeJSON(r, &req); err != nil {
		return profileWritePreparedRequest{
			kind:      profileWriteUpdate,
			profileID: profileID,
			decodeErr: err,
		}
	}
	req, err := prepareUpdateProfileRequest(req)
	if err != nil {
		return profileWritePreparedRequest{
			kind:      profileWriteUpdate,
			profileID: profileID,
			err: newProfileWritePreparationError(
				http.StatusBadRequest,
				"invalid_request",
				err.Error(),
				nil,
			),
		}
	}

	currentProfile, prepErr := svc.loadCurrentProfileForUpdate(r.Context(), profileID)
	if prepErr != nil {
		return profileWritePreparedRequest{
			kind:      profileWriteUpdate,
			profileID: profileID,
			err:       prepErr,
		}
	}
	if err := validatePreparedUpdateProfileRequest(currentProfile, req, svc.server.cfg.AllowRemote); err != nil {
		return profileWritePreparedRequest{
			kind:      profileWriteUpdate,
			profileID: profileID,
			err: newProfileWritePreparationError(
				http.StatusBadRequest,
				"invalid_request",
				err.Error(),
				nil,
			),
		}
	}
	return profileWritePreparedRequest{
		kind:      profileWriteUpdate,
		profileID: profileID,
		updateReq: req,
	}
}

func (svc profileWriteHTTPService) loadCurrentProfileForUpdate(ctx context.Context, profileID string) (models.Profile, *profileWritePreparationError) {
	currentProfile, ok, err := svc.server.store.GetProfile(ctx, profileID)
	if err != nil {
		return models.Profile{}, newProfileWritePreparationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to load profile",
			nil,
		)
	}
	if !ok {
		return models.Profile{}, newProfileWritePreparationError(
			http.StatusNotFound,
			"not_found",
			"profile not found",
			map[string]any{"profileId": profileID},
		)
	}
	return currentProfile, nil
}

func (svc profileWriteHTTPService) executePrepared(ctx context.Context, prepared profileWritePreparedRequest) (*models.Profile, error) {
	if prepared.decodeErr != nil || prepared.err != nil {
		return nil, nil
	}

	switch prepared.kind {
	case profileWriteUpdate:
		return svc.executeUpdatePrepared(ctx, prepared)
	default:
		return svc.executeCreatePrepared(ctx, prepared)
	}
}

func (svc profileWriteHTTPService) executeCreatePrepared(ctx context.Context, prepared profileWritePreparedRequest) (*models.Profile, error) {
	profile, err := svc.server.store.CreateProfile(ctx, prepared.createReq)
	if err != nil {
		return nil, err
	}
	decorated := decorateProfile(profile, svc.server.cfg.UploadDirectStream)
	return &decorated, nil
}

func (svc profileWriteHTTPService) executeUpdatePrepared(ctx context.Context, prepared profileWritePreparedRequest) (*models.Profile, error) {
	profile, ok, err := svc.server.store.UpdateProfile(ctx, prepared.profileID, prepared.updateReq)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, newProfileWritePreparationError(
			http.StatusNotFound,
			"not_found",
			"profile not found",
			map[string]any{"profileId": prepared.profileID},
		)
	}
	decorated := decorateProfile(profile, svc.server.cfg.UploadDirectStream)
	return &decorated, nil
}

func (svc profileWriteHTTPService) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	prepared := svc.prepareCreateProfile(r)
	if prepared.decodeErr != nil {
		writeJSONDecodeError(w, prepared.decodeErr, 0)
		return
	}
	if prepared.err != nil {
		if prepErr := (*profileWritePreparationError)(nil); errors.As(prepared.err, &prepErr) {
			resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, resp)
			return
		}
		resp := buildAPIErrorResponse(
			"internal_error",
			"failed to create profile",
			map[string]any{"error": prepared.err.Error()},
		)
		writeJSON(w, http.StatusInternalServerError, resp)
		return
	}
	profile, err := svc.executePrepared(r.Context(), prepared)
	if err == nil {
		writeJSON(w, http.StatusCreated, profile)
		return
	}
	if prepErr := (*profileWritePreparationError)(nil); errors.As(err, &prepErr) {
		resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
		writeJSON(w, prepErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse(
		"internal_error",
		"failed to create profile",
		map[string]any{"error": err.Error()},
	)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc profileWriteHTTPService) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	prepared := svc.prepareUpdateProfile(r)
	if prepared.decodeErr != nil {
		writeJSONDecodeError(w, prepared.decodeErr, 0)
		return
	}
	if prepared.err != nil {
		if prepErr := (*profileWritePreparationError)(nil); errors.As(prepared.err, &prepErr) {
			resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, resp)
			return
		}
		switch {
		case errors.Is(prepared.err, store.ErrEncryptedCredentials):
			resp := buildAPIErrorResponse("encrypted_credentials", prepared.err.Error(), nil)
			writeJSON(w, http.StatusBadRequest, resp)
		case errors.Is(prepared.err, store.ErrEncryptionKeyRequired):
			resp := buildAPIErrorResponse("encryption_required", prepared.err.Error(), nil)
			writeJSON(w, http.StatusBadRequest, resp)
		default:
			resp := buildAPIErrorResponse(
				"invalid_request",
				"failed to update profile",
				map[string]any{"error": prepared.err.Error()},
			)
			writeJSON(w, http.StatusBadRequest, resp)
		}
		return
	}
	profile, err := svc.executePrepared(r.Context(), prepared)
	if err == nil {
		writeJSON(w, http.StatusOK, profile)
		return
	}
	if prepErr := (*profileWritePreparationError)(nil); errors.As(err, &prepErr) {
		resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
		writeJSON(w, prepErr.status, resp)
		return
	}
	switch {
	case errors.Is(err, store.ErrEncryptedCredentials):
		resp := buildAPIErrorResponse("encrypted_credentials", err.Error(), nil)
		writeJSON(w, http.StatusBadRequest, resp)
	case errors.Is(err, store.ErrEncryptionKeyRequired):
		resp := buildAPIErrorResponse("encryption_required", err.Error(), nil)
		writeJSON(w, http.StatusBadRequest, resp)
	default:
		resp := buildAPIErrorResponse(
			"invalid_request",
			"failed to update profile",
			map[string]any{"error": err.Error()},
		)
		writeJSON(w, http.StatusBadRequest, resp)
	}
}

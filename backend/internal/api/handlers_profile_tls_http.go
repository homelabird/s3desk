package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type profileTLSHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type profileTLSHTTPService struct {
	server *server
}

func (e *profileTLSHTTPError) Error() string {
	return e.message
}

func newProfileTLSHTTPError(status int, code, message string, details map[string]any) *profileTLSHTTPError {
	return &profileTLSHTTPError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func newProfileTLSHTTPService(s *server) profileTLSHTTPService {
	return profileTLSHTTPService{server: s}
}

func (svc profileTLSHTTPService) prepareProfileTLS(r *http.Request) (string, error) {
	profileID := strings.TrimSpace(chi.URLParam(r, "profileId"))
	if profileID == "" {
		return "", newProfileTLSHTTPError(
			http.StatusBadRequest,
			"invalid_request",
			"profileId is required",
			nil,
		)
	}

	_, ok, err := svc.server.store.GetProfile(r.Context(), profileID)
	if err != nil {
		return "", newProfileTLSHTTPError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to load profile",
			nil,
		)
	}
	if !ok {
		return "", newProfileTLSHTTPError(
			http.StatusNotFound,
			"not_found",
			"profile not found",
			map[string]any{"profileId": profileID},
		)
	}

	return profileID, nil
}

func prepareProfileTLSPutConfig(req models.ProfileTLSConfig) (models.ProfileTLSConfig, *profileTLSHTTPError) {
	mode := strings.ToLower(strings.TrimSpace(string(req.Mode)))
	if mode == "" {
		mode = string(models.ProfileTLSModeDisabled)
	}
	switch mode {
	case string(models.ProfileTLSModeDisabled), string(models.ProfileTLSModeMTLS):
		req.Mode = models.ProfileTLSMode(mode)
	default:
		return models.ProfileTLSConfig{}, newProfileTLSHTTPError(
			http.StatusBadRequest,
			"invalid_request",
			"unsupported tls mode",
			map[string]any{"mode": mode},
		)
	}

	req.ClientCertPEM = strings.TrimSpace(req.ClientCertPEM)
	req.ClientKeyPEM = strings.TrimSpace(req.ClientKeyPEM)
	req.CACertPEM = strings.TrimSpace(req.CACertPEM)

	if req.Mode == models.ProfileTLSModeMTLS {
		if req.ClientCertPEM == "" || req.ClientKeyPEM == "" {
			return models.ProfileTLSConfig{}, newProfileTLSHTTPError(
				http.StatusBadRequest,
				"invalid_request",
				"client certificate and key are required for mTLS",
				nil,
			)
		}
		return req, nil
	}

	req.ClientCertPEM = ""
	req.ClientKeyPEM = ""
	req.CACertPEM = ""
	return req, nil
}

func (svc profileTLSHTTPService) preparePutProfileTLS(r *http.Request) (string, models.ProfileTLSConfig, error) {
	profileID, err := svc.prepareProfileTLS(r)
	if err != nil {
		return "", models.ProfileTLSConfig{}, err
	}

	var req models.ProfileTLSConfig
	if err := decodeJSON(r, &req); err != nil {
		return "", models.ProfileTLSConfig{}, newProfileTLSHTTPError(
			http.StatusBadRequest,
			"invalid_json",
			"invalid request body",
			map[string]any{"error": err.Error()},
		)
	}

	normalized, prepErr := prepareProfileTLSPutConfig(req)
	if prepErr != nil {
		return "", models.ProfileTLSConfig{}, prepErr
	}
	return profileID, normalized, nil
}

func (svc profileTLSHTTPService) executeGet(r *http.Request) (*models.ProfileTLSStatus, error) {
	profileID, err := svc.prepareProfileTLS(r)
	if err != nil {
		return nil, err
	}

	cfg, updatedAt, found, err := svc.server.store.GetProfileTLSConfig(r.Context(), profileID)
	if err != nil {
		if errors.Is(err, store.ErrEncryptionKeyRequired) {
			return nil, newProfileTLSHTTPError(
				http.StatusBadRequest,
				"encryption_required",
				err.Error(),
				nil,
			)
		}
		return nil, newProfileTLSHTTPError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to load tls config",
			map[string]any{"error": err.Error()},
		)
	}
	if !found {
		status := models.ProfileTLSStatus{
			Mode:          models.ProfileTLSModeDisabled,
			HasClientCert: false,
			HasClientKey:  false,
			HasCACert:     false,
		}
		return &status, nil
	}

	status := buildProfileTLSStatus(cfg, updatedAt)
	return &status, nil
}

func (svc profileTLSHTTPService) executePut(r *http.Request) (*models.ProfileTLSStatus, error) {
	profileID, putReq, err := svc.preparePutProfileTLS(r)
	if err != nil {
		return nil, err
	}

	cfg, updatedAt, err := svc.server.store.UpsertProfileTLSConfig(r.Context(), profileID, putReq)
	if err != nil {
		if errors.Is(err, store.ErrEncryptionKeyRequired) {
			return nil, newProfileTLSHTTPError(
				http.StatusBadRequest,
				"encryption_required",
				err.Error(),
				nil,
			)
		}
		return nil, newProfileTLSHTTPError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to store tls config",
			map[string]any{"error": err.Error()},
		)
	}

	status := buildProfileTLSStatus(cfg, updatedAt)
	return &status, nil
}

func (svc profileTLSHTTPService) executeDelete(r *http.Request) error {
	profileID, err := svc.prepareProfileTLS(r)
	if err != nil {
		return err
	}

	if _, err := svc.server.store.DeleteProfileTLSConfig(r.Context(), profileID); err != nil {
		return newProfileTLSHTTPError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to delete tls config",
			map[string]any{"error": err.Error()},
		)
	}
	return nil
}

func (svc profileTLSHTTPService) handleGetProfileTLS(w http.ResponseWriter, r *http.Request) {
	status, err := svc.executeGet(r)
	if err == nil {
		writeJSON(w, http.StatusOK, status)
		return
	}
	if apiErr := (*profileTLSHTTPError)(nil); errors.As(err, &apiErr) {
		resp := buildAPIErrorResponse(apiErr.code, apiErr.message, apiErr.details)
		writeJSON(w, apiErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to handle tls config request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc profileTLSHTTPService) handlePutProfileTLS(w http.ResponseWriter, r *http.Request) {
	status, err := svc.executePut(r)
	if err == nil {
		writeJSON(w, http.StatusOK, status)
		return
	}
	if apiErr := (*profileTLSHTTPError)(nil); errors.As(err, &apiErr) {
		resp := buildAPIErrorResponse(apiErr.code, apiErr.message, apiErr.details)
		writeJSON(w, apiErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to handle tls config request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc profileTLSHTTPService) handleDeleteProfileTLS(w http.ResponseWriter, r *http.Request) {
	err := svc.executeDelete(r)
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if apiErr := (*profileTLSHTTPError)(nil); errors.As(err, &apiErr) {
		resp := buildAPIErrorResponse(apiErr.code, apiErr.message, apiErr.details)
		writeJSON(w, apiErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to handle tls config request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func buildProfileTLSStatus(cfg models.ProfileTLSConfig, updatedAt string) models.ProfileTLSStatus {
	return models.ProfileTLSStatus{
		Mode:          cfg.Mode,
		HasClientCert: strings.TrimSpace(cfg.ClientCertPEM) != "",
		HasClientKey:  strings.TrimSpace(cfg.ClientKeyPEM) != "",
		HasCACert:     strings.TrimSpace(cfg.CACertPEM) != "",
		UpdatedAt:     updatedAt,
	}
}

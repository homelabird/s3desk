package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func (s *server) handleGetProfileTLS(w http.ResponseWriter, r *http.Request) {
	profileID := strings.TrimSpace(chi.URLParam(r, "profileId"))
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	_, ok, err := s.store.GetProfile(r.Context(), profileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	cfg, updatedAt, found, err := s.store.GetProfileTLSConfig(r.Context(), profileID)
	if err != nil {
		if errors.Is(err, store.ErrEncryptionKeyRequired) {
			writeError(w, http.StatusBadRequest, "encryption_required", err.Error(), nil)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load tls config", map[string]any{"error": err.Error()})
		return
	}
	if !found {
		writeJSON(w, http.StatusOK, models.ProfileTLSStatus{
			Mode:          models.ProfileTLSModeDisabled,
			HasClientCert: false,
			HasClientKey:  false,
			HasCACert:     false,
		})
		return
	}

	writeJSON(w, http.StatusOK, buildProfileTLSStatus(cfg, updatedAt))
}

func (s *server) handlePutProfileTLS(w http.ResponseWriter, r *http.Request) {
	profileID := strings.TrimSpace(chi.URLParam(r, "profileId"))
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	_, ok, err := s.store.GetProfile(r.Context(), profileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	var req models.ProfileTLSConfig
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	mode := strings.ToLower(strings.TrimSpace(string(req.Mode)))
	if mode == "" {
		mode = string(models.ProfileTLSModeDisabled)
	}
	switch mode {
	case string(models.ProfileTLSModeDisabled), string(models.ProfileTLSModeMTLS):
		req.Mode = models.ProfileTLSMode(mode)
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "unsupported tls mode", map[string]any{"mode": mode})
		return
	}

	req.ClientCertPEM = strings.TrimSpace(req.ClientCertPEM)
	req.ClientKeyPEM = strings.TrimSpace(req.ClientKeyPEM)
	req.CACertPEM = strings.TrimSpace(req.CACertPEM)

	if req.Mode == models.ProfileTLSModeMTLS {
		if req.ClientCertPEM == "" || req.ClientKeyPEM == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "client certificate and key are required for mTLS", nil)
			return
		}
	} else {
		req.ClientCertPEM = ""
		req.ClientKeyPEM = ""
		req.CACertPEM = ""
	}

	cfg, updatedAt, err := s.store.UpsertProfileTLSConfig(r.Context(), profileID, req)
	if err != nil {
		if errors.Is(err, store.ErrEncryptionKeyRequired) {
			writeError(w, http.StatusBadRequest, "encryption_required", err.Error(), nil)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to store tls config", map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, buildProfileTLSStatus(cfg, updatedAt))
}

func (s *server) handleDeleteProfileTLS(w http.ResponseWriter, r *http.Request) {
	profileID := strings.TrimSpace(chi.URLParam(r, "profileId"))
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	_, ok, err := s.store.GetProfile(r.Context(), profileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	if _, err := s.store.DeleteProfileTLSConfig(r.Context(), profileID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to delete tls config", map[string]any{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

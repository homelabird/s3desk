package api

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"gopkg.in/yaml.v3"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func (s *server) handleListProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := s.store.ListProfiles(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list profiles", nil)
		return
	}
	writeJSON(w, http.StatusOK, profiles)
}

func (s *server) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	var req models.ProfileCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Endpoint = strings.TrimSpace(req.Endpoint)
	req.Region = strings.TrimSpace(req.Region)
	req.AccessKeyID = strings.TrimSpace(req.AccessKeyID)
	req.SecretAccessKey = strings.TrimSpace(req.SecretAccessKey)
	if req.SessionToken != nil {
		v := strings.TrimSpace(*req.SessionToken)
		if v == "" {
			req.SessionToken = nil
		} else {
			req.SessionToken = &v
		}
	}
	if req.Name == "" || req.Endpoint == "" || req.Region == "" || req.AccessKeyID == "" || req.SecretAccessKey == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "missing required fields", nil)
		return
	}

	profile, err := s.store.CreateProfile(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create profile", nil)
		return
	}
	writeJSON(w, http.StatusCreated, profile)
}

func (s *server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	var req models.ProfileUpdateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	if req.Name != nil {
		v := strings.TrimSpace(*req.Name)
		if v == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "name must not be empty", nil)
			return
		}
		req.Name = &v
	}
	if req.Endpoint != nil {
		v := strings.TrimSpace(*req.Endpoint)
		if v == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "endpoint must not be empty", nil)
			return
		}
		req.Endpoint = &v
	}
	if req.Region != nil {
		v := strings.TrimSpace(*req.Region)
		if v == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "region must not be empty", nil)
			return
		}
		req.Region = &v
	}
	if req.AccessKeyID != nil {
		v := strings.TrimSpace(*req.AccessKeyID)
		if v == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "accessKeyId must not be empty", nil)
			return
		}
		req.AccessKeyID = &v
	}
	if req.SecretAccessKey != nil {
		v := strings.TrimSpace(*req.SecretAccessKey)
		if v == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "secretAccessKey must not be empty", nil)
			return
		}
		req.SecretAccessKey = &v
	}
	if req.SessionToken != nil {
		v := strings.TrimSpace(*req.SessionToken)
		req.SessionToken = &v
	}

	profile, ok, err := s.store.UpdateProfile(r.Context(), profileID, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to update profile", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	writeJSON(w, http.StatusOK, profile)
}

func (s *server) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	// Best-effort cleanup of local artifacts (logs, staging) before cascading deletes.
	if runningIDs, err := s.store.ListJobIDsByProfileAndStatus(r.Context(), profileID, models.JobStatusRunning); err == nil {
		for _, id := range runningIDs {
			s.jobs.Cancel(id)
		}
	}
	if jobIDs, err := s.store.ListJobIDsByProfile(r.Context(), profileID); err == nil {
		for _, id := range jobIDs {
			_ = os.Remove(filepath.Join(s.cfg.DataDir, "logs", "jobs", id+".log"))
		}
	}
	if sessions, err := s.store.ListUploadSessionsByProfile(r.Context(), profileID, 10_000); err == nil {
		for _, us := range sessions {
			if us.StagingDir != "" {
				_ = os.RemoveAll(us.StagingDir)
			}
		}
	}

	ok, err := s.store.DeleteProfile(r.Context(), profileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to delete profile", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleTestProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	ok, details, err := s.jobs.TestS3Connectivity(r.Context(), profileID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "test_failed", "profile test failed", map[string]any{"error": err.Error()})
		return
	}

	resp := models.ProfileTestResponse{OK: ok}
	if ok {
		resp.Message = "ok"
	} else {
		resp.Message = "failed"
	}
	resp.Details = details
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleExportProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	secrets, ok, err := s.store.GetProfileSecrets(r.Context(), profileID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrEncryptedCredentials):
			writeError(w, http.StatusBadRequest, "encrypted_credentials", err.Error(), nil)
		case errors.Is(err, store.ErrEncryptionKeyRequired):
			writeError(w, http.StatusBadRequest, "encryption_required", err.Error(), nil)
		default:
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
		}
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	export := profileExport{
		Profile: profileExportProfile{
			ID:                    secrets.ID,
			Name:                  secrets.Name,
			Endpoint:              secrets.Endpoint,
			Region:                secrets.Region,
			AccessKeyID:           secrets.AccessKeyID,
			SecretAccessKey:       secrets.SecretAccessKey,
			SessionToken:          secrets.SessionToken,
			ForcePathStyle:        secrets.ForcePathStyle,
			PreserveLeadingSlash:  secrets.PreserveLeadingSlash,
			TLSInsecureSkipVerify: secrets.TLSInsecureSkipVerify,
		},
	}

	if secrets.TLSConfig != nil {
		tls := profileExportTLS{
			Mode:          secrets.TLSConfig.Mode,
			ClientCertPEM: secrets.TLSConfig.ClientCertPEM,
			ClientKeyPEM:  secrets.TLSConfig.ClientKeyPEM,
			CACertPEM:     secrets.TLSConfig.CACertPEM,
		}
		if strings.TrimSpace(secrets.TLSConfigUpdatedAt) != "" {
			tls.UpdatedAt = secrets.TLSConfigUpdatedAt
		}
		export.TLS = &tls
	}

	data, err := yaml.Marshal(export)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to serialize profile export", nil)
		return
	}

	if wantsDownload(r) {
		filename := buildProfileExportFilename(secrets.Name, secrets.ID)
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	}
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

type profileExport struct {
	Profile profileExportProfile `yaml:"profile"`
	TLS     *profileExportTLS    `yaml:"tls,omitempty"`
}

type profileExportProfile struct {
	ID                    string  `yaml:"id,omitempty"`
	Name                  string  `yaml:"name"`
	Endpoint              string  `yaml:"endpoint"`
	Region                string  `yaml:"region"`
	AccessKeyID           string  `yaml:"accessKeyId"`
	SecretAccessKey       string  `yaml:"secretAccessKey"`
	SessionToken          *string `yaml:"sessionToken,omitempty"`
	ForcePathStyle        bool    `yaml:"forcePathStyle"`
	PreserveLeadingSlash  bool    `yaml:"preserveLeadingSlash"`
	TLSInsecureSkipVerify bool    `yaml:"tlsInsecureSkipVerify"`
}

type profileExportTLS struct {
	Mode          models.ProfileTLSMode `yaml:"mode"`
	ClientCertPEM string                `yaml:"clientCertPem,omitempty"`
	ClientKeyPEM  string                `yaml:"clientKeyPem,omitempty"`
	CACertPEM     string                `yaml:"caCertPem,omitempty"`
	UpdatedAt     string                `yaml:"updatedAt,omitempty"`
}

func wantsDownload(r *http.Request) bool {
	value := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("download")))
	return value == "1" || value == "true" || value == "yes"
}

func buildProfileExportFilename(name, id string) string {
	base := sanitizeExportFilename(name)
	if base == "" {
		base = sanitizeExportFilename(id)
	}
	if base == "" {
		base = "profile"
	}
	return fmt.Sprintf("%s.yaml", base)
}

func sanitizeExportFilename(value string) string {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"\\", "-",
		"/", "-",
		":", "-",
		"*", "-",
		"?", "-",
		"\"", "-",
		"<", "-",
		">", "-",
		"|", "-",
	)
	cleaned = replacer.Replace(cleaned)
	cleaned = strings.Join(strings.Fields(cleaned), "_")
	cleaned = strings.Trim(cleaned, "._-")
	return cleaned
}

package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"object-storage/internal/models"
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

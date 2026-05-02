package api

import (
	"net/http"

	"s3desk/internal/models"
)

type profileListHTTPService struct {
	server *server
}

func newProfileListHTTPService(s *server) profileListHTTPService {
	return profileListHTTPService{server: s}
}

func (svc profileListHTTPService) executeList(r *http.Request) ([]models.Profile, error) {
	profiles, err := svc.server.store.ListProfiles(r.Context())
	if err != nil {
		return nil, err
	}
	return decorateProfiles(profiles, svc.server.cfg.UploadDirectStream), nil
}

func (svc profileListHTTPService) handleListProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := svc.executeList(r)
	if err != nil {
		resp := buildJobSubmissionHTTPErrorResponse("internal_error", "failed to list profiles", nil)
		writeJSON(w, http.StatusInternalServerError, resp)
		return
	}

	writeJSON(w, http.StatusOK, profiles)
}

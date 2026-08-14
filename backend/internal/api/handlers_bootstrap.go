package api

import (
	"net/http"

	"s3desk/internal/models"
)

func (s *server) handleGetBootstrap(w http.ResponseWriter, r *http.Request) {
	profiles, err := newProfileListHTTPService(s).executeList(r)
	if err != nil {
		resp := buildAPIErrorResponse("internal_error", "failed to bootstrap profiles", nil)
		writeJSON(w, http.StatusInternalServerError, resp)
		return
	}

	writeJSON(w, http.StatusOK, models.BootstrapResponse{
		Meta:     newMetaHTTPService(s).executeGet(r),
		Profiles: profiles,
	})
}

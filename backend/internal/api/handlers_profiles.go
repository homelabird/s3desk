package api

import "net/http"

func (s *server) handleListProfiles(w http.ResponseWriter, r *http.Request) {
	newProfileListHTTPService(s).handleListProfiles(w, r)
}

func (s *server) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	newProfileWriteHTTPService(s).handleCreateProfile(w, r)
}

func (s *server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	newProfileWriteHTTPService(s).handleUpdateProfile(w, r)
}

func (s *server) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	newProfileDeleteHTTPService(s).handleDeleteProfile(w, r)
}

func (s *server) handleTestProfile(w http.ResponseWriter, r *http.Request) {
	newProfileConnectivityHTTPService(s).handleTestProfile(w, r)
}

func (s *server) handleBenchmarkProfile(w http.ResponseWriter, r *http.Request) {
	newProfileConnectivityHTTPService(s).handleBenchmarkProfile(w, r)
}

func (s *server) handleExportProfile(w http.ResponseWriter, r *http.Request) {
	newProfileExportHTTPService(s).handleExportProfile(w, r)
}

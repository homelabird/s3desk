package api

import "net/http"

func (s *server) handleGetProfileTLS(w http.ResponseWriter, r *http.Request) {
	newProfileTLSHTTPService(s).handleGetProfileTLS(w, r)
}

func (s *server) handlePutProfileTLS(w http.ResponseWriter, r *http.Request) {
	newProfileTLSHTTPService(s).handlePutProfileTLS(w, r)
}

func (s *server) handleDeleteProfileTLS(w http.ResponseWriter, r *http.Request) {
	newProfileTLSHTTPService(s).handleDeleteProfileTLS(w, r)
}

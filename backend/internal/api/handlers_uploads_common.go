package api

import "net/http"

func (s *server) handleCreateUploadSession(w http.ResponseWriter, r *http.Request) {
	newUploadSessionHTTPService(s).handleCreateUploadSession(w, r)
}

func (s *server) handleDeleteUploadSession(w http.ResponseWriter, r *http.Request) {
	newUploadSessionHTTPService(s).handleDeleteUploadSession(w, r)
}

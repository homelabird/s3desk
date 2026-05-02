package api

import "net/http"

func (s *server) handleUploadFiles(w http.ResponseWriter, r *http.Request) {
	newUploadFilesHTTPService(s).handleUploadFiles(w, r)
}

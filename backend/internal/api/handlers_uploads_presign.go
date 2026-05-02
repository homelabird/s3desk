package api

import "net/http"

func (s *server) handlePresignUpload(w http.ResponseWriter, r *http.Request) {
	newUploadPresignHTTPService(s).handlePresignUpload(w, r)
}

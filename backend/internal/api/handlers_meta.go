package api

import "net/http"

func (s *server) handleGetMeta(w http.ResponseWriter, r *http.Request) {
	newMetaHTTPService(s).handleGetMeta(w, r)
}

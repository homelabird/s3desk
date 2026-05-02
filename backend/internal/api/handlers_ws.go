package api

import "net/http"

func (s *server) handleWSUpgrade(w http.ResponseWriter, r *http.Request) {
	newRealtimeWSHTTPService(s).handleWSUpgrade(w, r)
}

func (s *server) checkWebSocketOrigin(r *http.Request) bool {
	return s.isAllowedRealtimeOrigin(r.Header.Get("Origin"))
}

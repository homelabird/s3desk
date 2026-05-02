package api

import "net/http"

func (s *server) handleEventsSSE(w http.ResponseWriter, r *http.Request) {
	newRealtimeSSEHTTPService(s).handleEventsSSE(w, r)
}

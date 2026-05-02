package api

import "net/http"

func (s *server) handleCreateRealtimeTicket(w http.ResponseWriter, r *http.Request) {
	newRealtimeTicketHTTPService(s).handleCreateRealtimeTicket(w, r)
}

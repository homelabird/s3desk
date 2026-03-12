package api

import (
	"net/http"
	"strings"
	"time"
)

func (s *server) handleCreateRealtimeTicket(w http.ResponseWriter, r *http.Request) {
	transport := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("transport")))
	switch transport {
	case "ws", "sse":
	default:
		writeError(w, http.StatusBadRequest, "invalid_transport", "transport must be ws or sse", nil)
		return
	}
	if s.realtimeTickets == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "realtime ticket store unavailable", nil)
		return
	}
	expiresAt := time.Now().UTC().Add(s.realtimeTickets.ttl)
	ticket, err := s.realtimeTickets.Issue(transport, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create realtime ticket", map[string]any{
			"reason": err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"ticket":           ticket,
		"transport":        transport,
		"expiresAt":        expiresAt.Format(time.RFC3339),
		"expiresInSeconds": int64(s.realtimeTickets.ttl.Seconds()),
	})
}

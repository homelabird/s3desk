package api

import (
	"net/http"
	"strings"
	"time"
)

type realtimeTicketHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type realtimeTicketResponse struct {
	Ticket           string `json:"ticket"`
	Transport        string `json:"transport"`
	ExpiresAt        string `json:"expiresAt"`
	ExpiresInSeconds int64  `json:"expiresInSeconds"`
}

type realtimeTicketHTTPService struct {
	server *server
}

func newRealtimeTicketHTTPService(s *server) realtimeTicketHTTPService {
	return realtimeTicketHTTPService{server: s}
}

func (svc realtimeTicketHTTPService) prepareCreateRealtimeTicket(w http.ResponseWriter, r *http.Request) (string, *realtimeTicketHTTPError) {
	if svc.server.rejectInvalidRealtimeOrigin(w, r, "realtime ticket requests require a trusted Origin") {
		return "", &realtimeTicketHTTPError{status: 0}
	}

	transport := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("transport")))
	switch transport {
	case "ws", "sse":
	default:
		return "", &realtimeTicketHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_transport",
			message: "transport must be ws or sse",
		}
	}

	if svc.server.realtimeTickets == nil {
		return "", &realtimeTicketHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "realtime ticket store unavailable",
		}
	}

	return transport, nil
}

func (svc realtimeTicketHTTPService) executePrepared(transport string) (*realtimeTicketResponse, *realtimeTicketHTTPError) {
	expiresAt := time.Now().UTC().Add(svc.server.realtimeTickets.ttl)
	ticket, err := svc.server.realtimeTickets.Issue(transport, expiresAt)
	if err != nil {
		return nil, &realtimeTicketHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to create realtime ticket",
			details: map[string]any{"reason": err.Error()},
		}
	}

	return &realtimeTicketResponse{
		Ticket:           ticket,
		Transport:        transport,
		ExpiresAt:        expiresAt.Format(time.RFC3339),
		ExpiresInSeconds: int64(svc.server.realtimeTickets.ttl.Seconds()),
	}, nil
}

func (svc realtimeTicketHTTPService) executeCreate(w http.ResponseWriter, r *http.Request) (*realtimeTicketResponse, *realtimeTicketHTTPError) {
	transport, err := svc.prepareCreateRealtimeTicket(w, r)
	if err != nil {
		return nil, err
	}
	return svc.executePrepared(transport)
}

func (svc realtimeTicketHTTPService) handleCreateRealtimeTicket(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeCreate(w, r)
	if err == nil {
		writeJSON(w, http.StatusCreated, resp)
		return
	}
	if err.status != 0 {
		respErr := buildAPIErrorResponse(err.code, err.message, err.details)
		writeJSON(w, err.status, &respErr)
	}
}

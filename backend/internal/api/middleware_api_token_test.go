package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestAPITokenAuthService_PrepareAuthorization_RejectsQueryAPIToken(t *testing.T) {
	t.Parallel()

	svc := newAPITokenAuthService(&server{cfg: config.Config{APIToken: "demo-token"}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta?apiToken=demo-token", nil)

	prepared := svc.prepareAuthorization(req)

	if prepared.err == nil {
		t.Fatal("expected prepare error")
	}
	if prepared.err.code != "invalid_request" {
		t.Fatalf("prepared.err.code=%q, want invalid_request", prepared.err.code)
	}
}

func TestRequireAPITokenAcceptsRealtimeTicket(t *testing.T) {
	t.Parallel()

	tickets := newRealtimeTicketStore(5 * time.Minute)
	ticket, err := tickets.Issue("sse", time.Now().UTC().Add(time.Minute))
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}

	s := &server{
		cfg:             config.Config{APIToken: "demo-token"},
		realtimeTickets: tickets,
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?realtimeTicket="+url.QueryEscape(ticket), nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Origin", "http://127.0.0.1:8080")

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusNoContent, rr.Body.String())
	}
}

func TestRequireAPITokenRejectsInvalidRealtimeTicketAndSetsRetryAfter(t *testing.T) {
	t.Parallel()

	s := &server{
		cfg:       config.Config{APIToken: "demo-token"},
		authLimit: newAuthFailureLimiter(1, time.Minute, 2*time.Second),
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?realtimeTicket=bad-ticket", nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Origin", "http://127.0.0.1:8080")

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusUnauthorized)
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After header")
	}

	var resp models.ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if resp.Error.Code != "unauthorized" {
		t.Fatalf("error code=%q, want unauthorized", resp.Error.Code)
	}
}

func TestRequireAPITokenRejectsNullOriginWithoutConsumingRealtimeTicket(t *testing.T) {
	t.Parallel()

	tickets := newRealtimeTicketStore(5 * time.Minute)
	ticket, err := tickets.Issue("sse", time.Now().UTC().Add(time.Minute))
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}

	s := &server{
		cfg:             config.Config{APIToken: "demo-token"},
		realtimeTickets: tickets,
	}

	rejectReq := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?realtimeTicket="+url.QueryEscape(ticket), nil)
	rejectReq.Header.Set("Accept", "text/event-stream")
	rejectReq.Header.Set("Origin", "null")
	rejectRR := httptest.NewRecorder()

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rejectRR, rejectReq)

	if rejectRR.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d body=%s", rejectRR.Code, http.StatusForbidden, rejectRR.Body.String())
	}

	acceptReq := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?realtimeTicket="+url.QueryEscape(ticket), nil)
	acceptReq.Header.Set("Accept", "text/event-stream")
	acceptReq.Header.Set("Origin", "http://127.0.0.1:8080")
	acceptRR := httptest.NewRecorder()

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(acceptRR, acceptReq)

	if acceptRR.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d body=%s", acceptRR.Code, http.StatusNoContent, acceptRR.Body.String())
	}
}

func TestRequireAPITokenRejectsOriginWithPathWithoutConsumingRealtimeTicket(t *testing.T) {
	t.Parallel()

	tickets := newRealtimeTicketStore(5 * time.Minute)
	ticket, err := tickets.Issue("sse", time.Now().UTC().Add(time.Minute))
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}

	s := &server{
		cfg:             config.Config{APIToken: "demo-token"},
		realtimeTickets: tickets,
	}

	rejectReq := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?realtimeTicket="+url.QueryEscape(ticket), nil)
	rejectReq.Header.Set("Accept", "text/event-stream")
	rejectReq.Header.Set("Origin", "http://127.0.0.1:8080/app")
	rejectRR := httptest.NewRecorder()

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rejectRR, rejectReq)

	if rejectRR.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d body=%s", rejectRR.Code, http.StatusForbidden, rejectRR.Body.String())
	}

	acceptReq := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?realtimeTicket="+url.QueryEscape(ticket), nil)
	acceptReq.Header.Set("Accept", "text/event-stream")
	acceptReq.Header.Set("Origin", "http://127.0.0.1:8080")
	acceptRR := httptest.NewRecorder()

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(acceptRR, acceptReq)

	if acceptRR.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d body=%s", acceptRR.Code, http.StatusNoContent, acceptRR.Body.String())
	}
}

func TestRequireAPITokenRejectsMalformedOriginWithoutConsumingRealtimeTicket(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		transport   string
		path        string
		origin      string
		configure   func(*http.Request)
		validOrigin string
	}{
		{
			name:        "sse origin with userinfo",
			transport:   "sse",
			path:        "/api/v1/events",
			origin:      "https://user@localhost:8080",
			configure:   func(req *http.Request) { req.Header.Set("Accept", "text/event-stream") },
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:        "sse origin with empty host",
			transport:   "sse",
			path:        "/api/v1/events",
			origin:      "https://:5173",
			configure:   func(req *http.Request) { req.Header.Set("Accept", "text/event-stream") },
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:        "sse origin with trailing slash",
			transport:   "sse",
			path:        "/api/v1/events",
			origin:      "https://localhost:8080/",
			configure:   func(req *http.Request) { req.Header.Set("Accept", "text/event-stream") },
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:        "sse origin with query",
			transport:   "sse",
			path:        "/api/v1/events",
			origin:      "https://localhost:8080?from=app",
			configure:   func(req *http.Request) { req.Header.Set("Accept", "text/event-stream") },
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:        "sse origin with fragment",
			transport:   "sse",
			path:        "/api/v1/events",
			origin:      "https://localhost:8080#stale-fragment",
			configure:   func(req *http.Request) { req.Header.Set("Accept", "text/event-stream") },
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:        "sse file origin",
			transport:   "sse",
			path:        "/api/v1/events",
			origin:      "file://localhost",
			configure:   func(req *http.Request) { req.Header.Set("Accept", "text/event-stream") },
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:        "sse unsupported scheme origin",
			transport:   "sse",
			path:        "/api/v1/events",
			origin:      "wss://localhost:8080",
			configure:   func(req *http.Request) { req.Header.Set("Accept", "text/event-stream") },
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:      "ws origin with userinfo",
			transport: "ws",
			path:      "/api/v1/ws",
			origin:    "https://user@localhost:8080",
			configure: func(req *http.Request) {
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			},
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:      "ws origin with empty host",
			transport: "ws",
			path:      "/api/v1/ws",
			origin:    "https://:5173",
			configure: func(req *http.Request) {
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			},
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:      "ws origin with trailing slash",
			transport: "ws",
			path:      "/api/v1/ws",
			origin:    "https://localhost:8080/",
			configure: func(req *http.Request) {
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			},
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:      "ws origin with query",
			transport: "ws",
			path:      "/api/v1/ws",
			origin:    "https://localhost:8080?from=app",
			configure: func(req *http.Request) {
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			},
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:      "ws origin with fragment",
			transport: "ws",
			path:      "/api/v1/ws",
			origin:    "https://localhost:8080#stale-fragment",
			configure: func(req *http.Request) {
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			},
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:      "ws file origin",
			transport: "ws",
			path:      "/api/v1/ws",
			origin:    "file://localhost",
			configure: func(req *http.Request) {
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			},
			validOrigin: "http://127.0.0.1:8080",
		},
		{
			name:      "ws unsupported scheme origin",
			transport: "ws",
			path:      "/api/v1/ws",
			origin:    "wss://localhost:8080",
			configure: func(req *http.Request) {
				req.Header.Set("Connection", "Upgrade")
				req.Header.Set("Upgrade", "websocket")
			},
			validOrigin: "http://127.0.0.1:8080",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tickets := newRealtimeTicketStore(5 * time.Minute)
			ticket, err := tickets.Issue(tc.transport, time.Now().UTC().Add(time.Minute))
			if err != nil {
				t.Fatalf("issue ticket: %v", err)
			}

			s := &server{
				cfg:             config.Config{APIToken: "demo-token"},
				realtimeTickets: tickets,
			}

			rejectReq := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080"+tc.path+"?realtimeTicket="+url.QueryEscape(ticket), nil)
			tc.configure(rejectReq)
			rejectReq.Header.Set("Origin", tc.origin)
			rejectRR := httptest.NewRecorder()

			s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			})).ServeHTTP(rejectRR, rejectReq)

			if rejectRR.Code != http.StatusForbidden {
				t.Fatalf("status=%d, want %d body=%s", rejectRR.Code, http.StatusForbidden, rejectRR.Body.String())
			}

			acceptReq := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080"+tc.path+"?realtimeTicket="+url.QueryEscape(ticket), nil)
			tc.configure(acceptReq)
			acceptReq.Header.Set("Origin", tc.validOrigin)
			acceptRR := httptest.NewRecorder()

			s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			})).ServeHTTP(acceptRR, acceptReq)

			if acceptRR.Code != http.StatusNoContent {
				t.Fatalf("status=%d, want %d body=%s", acceptRR.Code, http.StatusNoContent, acceptRR.Body.String())
			}
		})
	}
}

func TestRequireAPITokenAcceptsRealtimeTicketForAllowlistedMixedCaseHostOrigin(t *testing.T) {
	t.Parallel()

	tickets := newRealtimeTicketStore(5 * time.Minute)
	ticket, err := tickets.Issue("sse", time.Now().UTC().Add(time.Minute))
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}

	s := &server{
		cfg: config.Config{
			APIToken:     "demo-token",
			AllowRemote:  true,
			AllowedHosts: []string{"s3desk.local"},
		},
		realtimeTickets: tickets,
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://s3desk.local:8080/api/v1/events?realtimeTicket="+url.QueryEscape(ticket), nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Origin", "https://S3DESK.LOCAL.:8443")

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusNoContent, rr.Body.String())
	}
}

func TestRequireAPITokenAcceptsWebSocketRealtimeTicketForAllowlistedMixedCaseHostOrigin(t *testing.T) {
	t.Parallel()

	tickets := newRealtimeTicketStore(5 * time.Minute)
	ticket, err := tickets.Issue("ws", time.Now().UTC().Add(time.Minute))
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}

	s := &server{
		cfg: config.Config{
			APIToken:     "demo-token",
			AllowRemote:  true,
			AllowedHosts: []string{"s3desk.local"},
		},
		realtimeTickets: tickets,
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://s3desk.local:8080/api/v1/ws?realtimeTicket="+url.QueryEscape(ticket), nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Origin", "https://S3DESK.LOCAL.:8443")

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusNoContent, rr.Body.String())
	}
}

func TestRequireAPITokenAcceptsRealtimeTicketForAllowlistedIPv6ULAOrigin(t *testing.T) {
	t.Parallel()

	tickets := newRealtimeTicketStore(5 * time.Minute)
	ticket, err := tickets.Issue("sse", time.Now().UTC().Add(time.Minute))
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}

	s := &server{
		cfg: config.Config{
			APIToken:     "demo-token",
			AllowRemote:  true,
			AllowedHosts: []string{"fd00::25"},
		},
		realtimeTickets: tickets,
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://[fd00::25]:8080/api/v1/events?realtimeTicket="+url.QueryEscape(ticket), nil)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Origin", "https://[FD00::25]:8443")

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusNoContent, rr.Body.String())
	}
}

func TestRequireAPITokenAcceptsWebSocketRealtimeTicketForAllowlistedIPv6ULAOrigin(t *testing.T) {
	t.Parallel()

	tickets := newRealtimeTicketStore(5 * time.Minute)
	ticket, err := tickets.Issue("ws", time.Now().UTC().Add(time.Minute))
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}

	s := &server{
		cfg: config.Config{
			APIToken:     "demo-token",
			AllowRemote:  true,
			AllowedHosts: []string{"fd00::25"},
		},
		realtimeTickets: tickets,
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://[fd00::25]:8080/api/v1/ws?realtimeTicket="+url.QueryEscape(ticket), nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Origin", "https://[FD00::25]:8443")

	s.requireAPIToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusNoContent, rr.Body.String())
	}
}

package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_ReturnsInvalidTransport(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ftp", nil)
	req.Header.Set("Origin", "http://localhost:5173")

	svc.handleCreateRealtimeTicket(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_transport" {
		t.Fatalf("resp.Error.Code=%q, want invalid_transport", resp.Error.Code)
	}
}

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_ReturnsStoreUnavailable(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
	req.Header.Set("Origin", "http://localhost:5173")

	svc.handleCreateRealtimeTicket(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusInternalServerError)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Message != "realtime ticket store unavailable" {
		t.Fatalf("resp.Error.Message=%q, want realtime ticket store unavailable", resp.Error.Message)
	}
}

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_AcceptsAllowlistedMixedCaseHostOrigin(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{
		cfg: config.Config{
			AllowRemote:  true,
			AllowedHosts: []string{"s3desk.local"},
		},
		realtimeTickets: newRealtimeTicketStore(5 * time.Minute),
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "http://s3desk.local:8080/api/v1/realtime-ticket?transport=ws", nil)
	req.Header.Set("Origin", "https://S3DESK.LOCAL.:8443")

	svc.handleCreateRealtimeTicket(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("rec.Code=%d, want %d body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var resp realtimeTicketResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Transport != "ws" {
		t.Fatalf("resp.Transport=%q, want ws", resp.Transport)
	}
	if resp.Ticket == "" {
		t.Fatal("expected ticket")
	}
}

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_AcceptsAllowlistedIPv6ULAOrigin(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{
		cfg: config.Config{
			AllowRemote:  true,
			AllowedHosts: []string{"fd00::25"},
		},
		realtimeTickets: newRealtimeTicketStore(5 * time.Minute),
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "http://[fd00::25]:8080/api/v1/realtime-ticket?transport=ws", nil)
	req.Header.Set("Origin", "https://[FD00::25]:8443")

	svc.handleCreateRealtimeTicket(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("rec.Code=%d, want %d body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var resp realtimeTicketResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Transport != "ws" {
		t.Fatalf("resp.Transport=%q, want ws", resp.Transport)
	}
	if resp.Ticket == "" {
		t.Fatal("expected ticket")
	}
}

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_RejectsInvalidPortOrigin(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
	req.Header.Set("Origin", "https://localhost:65536")

	svc.handleCreateRealtimeTicket(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("rec.Code=%d, want %d body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "forbidden" {
		t.Fatalf("resp.Error.Code=%q, want forbidden", resp.Error.Code)
	}
	if resp.Error.Message != "realtime ticket requests require a trusted Origin" {
		t.Fatalf("resp.Error.Message=%q, want trusted Origin message", resp.Error.Message)
	}
}

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_RejectsMissingOrigin(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)

	svc.handleCreateRealtimeTicket(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("rec.Code=%d, want %d body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "forbidden" {
		t.Fatalf("resp.Error.Code=%q, want forbidden", resp.Error.Code)
	}
	if resp.Error.Message != "realtime ticket requests require a trusted Origin" {
		t.Fatalf("resp.Error.Message=%q, want trusted Origin message", resp.Error.Message)
	}
}

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_RejectsMalformedOriginTable(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		origin string
	}{
		{
			name:   "null origin",
			origin: "null",
		},
		{
			name:   "origin with path",
			origin: "http://localhost:8080/app",
		},
		{
			name:   "origin with trailing slash",
			origin: "https://localhost:8080/",
		},
		{
			name:   "origin with query",
			origin: "https://localhost:8080?from=app",
		},
		{
			name:   "origin with fragment",
			origin: "https://localhost:8080#stale-fragment",
		},
		{
			name:   "origin with userinfo",
			origin: "https://user@localhost:8080",
		},
		{
			name:   "origin with empty host",
			origin: "https://:5173",
		},
		{
			name:   "file origin",
			origin: "file://localhost",
		},
		{
			name:   "unsupported scheme origin",
			origin: "wss://localhost:8080",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
			req.Header.Set("Origin", tc.origin)

			svc.handleCreateRealtimeTicket(rec, req)

			if rec.Code != http.StatusForbidden {
				t.Fatalf("rec.Code=%d, want %d body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
			}
			var resp models.ErrorResponse
			if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if resp.Error.Code != "forbidden" {
				t.Fatalf("resp.Error.Code=%q, want forbidden", resp.Error.Code)
			}
			if resp.Error.Message != "realtime ticket requests require a trusted Origin" {
				t.Fatalf("resp.Error.Message=%q, want trusted Origin message", resp.Error.Message)
			}
		})
	}
}

func TestPrepareCreateRealtimeTicket_RejectsMalformedOriginsWithShortCircuitError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		origin string
	}{
		{
			name: "missing origin",
		},
		{
			name:   "null origin",
			origin: "null",
		},
		{
			name:   "origin with path",
			origin: "http://localhost:8080/app",
		},
		{
			name:   "origin with trailing slash",
			origin: "https://localhost:8080/",
		},
		{
			name:   "origin with query",
			origin: "https://localhost:8080?from=app",
		},
		{
			name:   "origin with fragment",
			origin: "https://localhost:8080#stale-fragment",
		},
		{
			name:   "origin with userinfo",
			origin: "https://user@localhost:8080",
		},
		{
			name:   "origin with empty host",
			origin: "https://:5173",
		},
		{
			name:   "file origin",
			origin: "file://localhost",
		},
		{
			name:   "unsupported scheme origin",
			origin: "wss://localhost:8080",
		},
		{
			name:   "origin with invalid port",
			origin: "https://localhost:65536",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}

			transport, err := svc.prepareCreateRealtimeTicket(rec, req)

			if transport != "" {
				t.Fatalf("transport=%q, want empty", transport)
			}
			if err == nil {
				t.Fatal("expected error")
			}
			if err.status != 0 {
				t.Fatalf("err.status=%d, want 0", err.status)
			}
			if rec.Code != http.StatusForbidden {
				t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusForbidden)
			}
		})
	}
}

func TestExecuteCreate_PropagatesInvalidTransportError(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ftp", nil)
	req.Header.Set("Origin", "http://localhost:5173")

	resp, err := svc.executeCreate(rec, req)

	if resp != nil {
		t.Fatal("expected nil response")
	}
	if err == nil {
		t.Fatal("expected error")
	}
	if err.status != http.StatusBadRequest {
		t.Fatalf("err.status=%d, want %d", err.status, http.StatusBadRequest)
	}
	if err.code != "invalid_transport" {
		t.Fatalf("err.code=%q, want invalid_transport", err.code)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d before wrapper write", rec.Code, http.StatusOK)
	}
}

func TestExecuteCreate_PropagatesStoreUnavailableError(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
	req.Header.Set("Origin", "http://localhost:5173")

	resp, err := svc.executeCreate(rec, req)

	if resp != nil {
		t.Fatal("expected nil response")
	}
	if err == nil {
		t.Fatal("expected error")
	}
	if err.status != http.StatusInternalServerError {
		t.Fatalf("err.status=%d, want %d", err.status, http.StatusInternalServerError)
	}
	if err.message != "realtime ticket store unavailable" {
		t.Fatalf("err.message=%q, want realtime ticket store unavailable", err.message)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d before wrapper write", rec.Code, http.StatusOK)
	}
}

func TestExecuteCreate_PropagatesMalformedOriginShortCircuit(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		origin string
	}{
		{
			name: "missing origin",
		},
		{
			name:   "null origin",
			origin: "null",
		},
		{
			name:   "origin with path",
			origin: "http://localhost:8080/app",
		},
		{
			name:   "origin with trailing slash",
			origin: "https://localhost:8080/",
		},
		{
			name:   "origin with query",
			origin: "https://localhost:8080?from=app",
		},
		{
			name:   "origin with fragment",
			origin: "https://localhost:8080#stale-fragment",
		},
		{
			name:   "origin with userinfo",
			origin: "https://user@localhost:8080",
		},
		{
			name:   "origin with empty host",
			origin: "https://:5173",
		},
		{
			name:   "file origin",
			origin: "file://localhost",
		},
		{
			name:   "unsupported scheme origin",
			origin: "wss://localhost:8080",
		},
		{
			name:   "origin with invalid port",
			origin: "https://localhost:65536",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}

			resp, err := svc.executeCreate(rec, req)

			if resp != nil {
				t.Fatal("expected nil response")
			}
			if err == nil {
				t.Fatal("expected error")
			}
			if err.status != 0 {
				t.Fatalf("err.status=%d, want 0", err.status)
			}
			if rec.Code != http.StatusForbidden {
				t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusForbidden)
			}
		})
	}
}

func TestExecutePreparedRealtimeTicket_UsesPreparedExecution(t *testing.T) {
	t.Parallel()

	svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})

	resp, err := svc.executePrepared("ws")
	if err != nil {
		t.Fatalf("err=%v, want nil", err)
	}
	if resp == nil {
		t.Fatal("expected ticket response")
	}
	if resp.Transport != "ws" {
		t.Fatalf("resp.Transport=%q, want ws", resp.Transport)
	}
	if resp.Ticket == "" {
		t.Fatal("expected ticket")
	}
}

func TestExecutePreparedRealtimeTicket_PropagatesIssueFailure(t *testing.T) {
	previousReader := realtimeTicketRandReader
	realtimeTicketRandReader = failingRealtimeTicketReader{}
	t.Cleanup(func() {
		realtimeTicketRandReader = previousReader
	})

	svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})

	resp, err := svc.executePrepared("ws")

	if resp != nil {
		t.Fatal("expected nil response")
	}
	if err == nil {
		t.Fatal("expected error")
	}
	if err.status != http.StatusInternalServerError {
		t.Fatalf("err.status=%d, want %d", err.status, http.StatusInternalServerError)
	}
	if err.code != "internal_error" {
		t.Fatalf("err.code=%q, want internal_error", err.code)
	}
	if err.message != "failed to create realtime ticket" {
		t.Fatalf("err.message=%q, want failed to create realtime ticket", err.message)
	}
	if got, _ := err.details["reason"].(string); got != "generate realtime ticket: entropy unavailable" {
		t.Fatalf("err.details[reason]=%q, want generate realtime ticket: entropy unavailable", got)
	}
}

func TestRealtimeTicketHTTPService_HandleCreateRealtimeTicket_ReturnsIssueFailureDetails(t *testing.T) {
	previousReader := realtimeTicketRandReader
	realtimeTicketRandReader = failingRealtimeTicketReader{}
	t.Cleanup(func() {
		realtimeTicketRandReader = previousReader
	})

	svc := newRealtimeTicketHTTPService(&server{realtimeTickets: newRealtimeTicketStore(5 * time.Minute)})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
	req.Header.Set("Origin", "http://localhost:5173")

	svc.handleCreateRealtimeTicket(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("rec.Code=%d, want %d body=%s", rec.Code, http.StatusInternalServerError, rec.Body.String())
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "internal_error" {
		t.Fatalf("resp.Error.Code=%q, want internal_error", resp.Error.Code)
	}
	if resp.Error.Message != "failed to create realtime ticket" {
		t.Fatalf("resp.Error.Message=%q, want failed to create realtime ticket", resp.Error.Message)
	}
	if got, _ := resp.Error.Details["reason"].(string); got != "generate realtime ticket: entropy unavailable" {
		t.Fatalf("resp.Error.Details[reason]=%q, want generate realtime ticket: entropy unavailable", got)
	}
}

package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/ws"
)

func TestHandleEventsSSERejectsWhenRealtimeLimitExceeded(t *testing.T) {
	t.Parallel()

	s := &server{
		hub:           ws.NewHub(),
		realtimeLimit: newRequestLimiter(1),
		realtimeMax:   1,
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("failed to pre-acquire realtime slot")
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)

	s.handleEventsSSE(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusTooManyRequests)
	}
	if got := rr.Header().Get("Retry-After"); got != "2" {
		t.Fatalf("Retry-After=%q, want %q", got, "2")
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "rate_limited" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "rate_limited")
	}
}

func TestHandleWSUpgradeRejectsWhenRealtimeLimitExceeded(t *testing.T) {
	t.Parallel()

	s := &server{
		hub:           ws.NewHub(),
		realtimeLimit: newRequestLimiter(1),
		realtimeMax:   1,
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("failed to pre-acquire realtime slot")
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)

	s.handleWSUpgrade(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusTooManyRequests)
	}
	if got := rr.Header().Get("Retry-After"); got != "2" {
		t.Fatalf("Retry-After=%q, want %q", got, "2")
	}
	if !strings.Contains(rr.Body.String(), "too many concurrent realtime connections") {
		t.Fatalf("body=%q, want realtime limit message", rr.Body.String())
	}
}

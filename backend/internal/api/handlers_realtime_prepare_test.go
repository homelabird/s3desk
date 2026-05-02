package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/ws"
)

func TestParseRealtimeAfterSeq_PrefersHeaderBeforeQuery(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events?afterSeq=7", nil)
	req.Header.Set("Last-Event-ID", "12")

	if got := parseRealtimeAfterSeq(req, "Last-Event-ID"); got != 12 {
		t.Fatalf("got=%d, want 12", got)
	}
}

func TestParseRealtimeAfterSeq_UsesQueryForWS(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws?afterSeq=9", nil)

	if got := parseRealtimeAfterSeq(req, ""); got != 9 {
		t.Fatalf("got=%d, want 9", got)
	}
}

func TestParseRealtimeIncludeLogs_DefaultsTrueOnInvalidValue(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events?includeLogs=maybe", nil)

	if got := parseRealtimeIncludeLogs(req); !got {
		t.Fatal("expected includeLogs=true")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnRejectedOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject request")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected origin")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnNullOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "null")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject null origin request")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected null origin")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnOriginWithPath(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "http://127.0.0.1:8080/app")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject origin with path")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected origin with path")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnOriginWithTrailingSlash(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://localhost:8080/")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject origin with trailing slash")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected origin with trailing slash")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnOriginWithQuery(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://localhost:8080?from=app")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject origin with query")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected origin with query")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnOriginWithFragment(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://localhost:8080#stale-fragment")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject origin with fragment")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected origin with fragment")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnOriginWithUserinfo(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://user@localhost:8080")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject origin with userinfo")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected origin with userinfo")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnOriginWithEmptyHost(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://:5173")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject origin with empty host")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected origin with empty host")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnFileOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "file://localhost")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject file origin")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected file origin")
	}
}

func TestPrepareRealtimeRequest_ReleasesSlotOnUnsupportedSchemeOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "wss://localhost:8080")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject unsupported scheme origin")
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected unsupported scheme origin")
	}
}

func TestSubscribeRealtime_ReturnsBacklogAndClosesClientOnRelease(t *testing.T) {
	t.Parallel()

	hub := ws.NewHub()
	hub.Publish(ws.Event{Type: "job.created"})
	hub.Publish(ws.Event{Type: "job.completed"})

	s := &server{hub: hub}
	client, backlog, release := s.subscribeRealtime(1, false)

	if len(backlog) != 1 {
		t.Fatalf("backlog len=%d, want 1", len(backlog))
	}
	if backlog[0].Seq != 2 {
		t.Fatalf("backlog seq=%d, want 2", backlog[0].Seq)
	}

	release()
	if _, ok := <-client.Messages(); ok {
		t.Fatal("expected client channel to be closed after release")
	}
}

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

	parsed := parseRealtimeAfterSeq(req, "Last-Event-ID")
	if !parsed.ok {
		t.Fatalf("parse failed: field=%q value=%q", parsed.invalidField, parsed.invalidValue)
	}
	if parsed.value != 12 {
		t.Fatalf("got=%d, want 12", parsed.value)
	}
}

func TestParseRealtimeAfterSeq_UsesQueryForWS(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws?afterSeq=9", nil)

	parsed := parseRealtimeAfterSeq(req, "")
	if !parsed.ok {
		t.Fatalf("parse failed: field=%q value=%q", parsed.invalidField, parsed.invalidValue)
	}
	if parsed.value != 9 {
		t.Fatalf("got=%d, want 9", parsed.value)
	}
}

func TestParseRealtimeAfterSeq_RejectsInvalidHeaderBeforeQuery(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events?afterSeq=7", nil)
	req.Header.Set("Last-Event-ID", "abc")

	parsed := parseRealtimeAfterSeq(req, "Last-Event-ID")
	if parsed.ok {
		t.Fatal("expected parse to fail")
	}
	if parsed.invalidField != "Last-Event-ID" {
		t.Fatalf("invalidField=%q, want Last-Event-ID", parsed.invalidField)
	}
	if parsed.invalidValue != "abc" {
		t.Fatalf("invalidValue=%q, want abc", parsed.invalidValue)
	}
}

func TestParseRealtimeAfterSeq_RejectsNegativeQuery(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws?afterSeq=-1", nil)

	parsed := parseRealtimeAfterSeq(req, "")
	if parsed.ok {
		t.Fatal("expected parse to fail")
	}
	if parsed.invalidField != "afterSeq" {
		t.Fatalf("invalidField=%q, want afterSeq", parsed.invalidField)
	}
	if parsed.invalidValue != "-1" {
		t.Fatalf("invalidValue=%q, want -1", parsed.invalidValue)
	}
}

func TestParseRealtimeIncludeLogs_InvalidValueReturnsNotOK(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events?includeLogs=maybe", nil)

	if _, ok := parseRealtimeIncludeLogs(req); ok {
		t.Fatal("expected includeLogs parse to fail")
	}
}

func TestPrepareRealtimeRequest_RejectsInvalidIncludeLogsAndReleasesSlot(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?includeLogs=maybe", nil)
	req.Header.Set("Origin", "http://127.0.0.1:8080")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject invalid includeLogs")
	}
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after invalid includeLogs")
	}
}

func TestPrepareRealtimeRequest_RejectsInvalidAfterSeqAndReleasesSlot(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?afterSeq=abc", nil)
	req.Header.Set("Origin", "http://127.0.0.1:8080")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject invalid afterSeq")
	}
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after invalid afterSeq")
	}
}

func TestPrepareRealtimeRequest_RejectsInvalidLastEventIDAndReleasesSlot(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events?afterSeq=7", nil)
	req.Header.Set("Origin", "http://127.0.0.1:8080")
	req.Header.Set("Last-Event-ID", "abc")

	if _, _, _, ok := s.prepareRealtimeRequest(rr, req, "sse", "trusted Origin required", "Last-Event-ID"); ok {
		t.Fatal("expected prepare to reject invalid Last-Event-ID")
	}
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after invalid Last-Event-ID")
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

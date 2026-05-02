package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
)

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReturnsInternalErrorWithoutFlusher(t *testing.T) {
	t.Parallel()

	svc := newRealtimeSSEHTTPService(&server{cfg: config.Config{}})
	rw := &nonFlushingResponseWriter{}
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)

	svc.handleEventsSSE(rw, req)

	if rw.status != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", rw.status, http.StatusInternalServerError)
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnRejectedOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse origin")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnNullOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "null")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected null sse origin")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnOriginWithPath(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "http://127.0.0.1:8080/app")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse origin with path")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnOriginWithTrailingSlash(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://localhost:8080/")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse origin with trailing slash")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnOriginWithQuery(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://localhost:8080?from=app")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse origin with query")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnOriginWithFragment(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://localhost:8080#stale-fragment")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse origin with fragment")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnOriginWithUserinfo(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://user@localhost:8080")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse origin with userinfo")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnOriginWithEmptyHost(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "https://:5173")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse origin with empty host")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnFileOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "file://localhost")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse file origin")
	}
}

func TestRealtimeSSEHTTPService_HandleEventsSSE_ReleasesSlotOnUnsupportedSchemeOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
	req.Header.Set("Origin", "wss://localhost:8080")

	newRealtimeSSEHTTPService(s).handleEventsSSE(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected sse unsupported scheme origin")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnRejectedOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws origin")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnNullOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "null")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected null ws origin")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnOriginWithPath(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "http://127.0.0.1:8080/app")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws origin with path")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnOriginWithTrailingSlash(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "https://localhost:8080/")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws origin with trailing slash")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnOriginWithQuery(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "https://localhost:8080?from=app")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws origin with query")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnOriginWithFragment(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "https://localhost:8080#stale-fragment")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws origin with fragment")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnOriginWithUserinfo(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "https://user@localhost:8080")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws origin with userinfo")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnOriginWithEmptyHost(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "https://:5173")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws origin with empty host")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnFileOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "file://localhost")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws file origin")
	}
}

func TestRealtimeWSHTTPService_HandleWSUpgrade_ReleasesSlotOnUnsupportedSchemeOrigin(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{}, realtimeLimit: newRequestLimiter(1), realtimeMax: 1}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
	req.Header.Set("Origin", "wss://localhost:8080")

	newRealtimeWSHTTPService(s).handleWSUpgrade(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	if !s.realtimeLimit.tryAcquire() {
		t.Fatal("expected realtime slot to be released after rejected ws unsupported scheme origin")
	}
}

package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type nonFlushingResponseWriter struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func (w *nonFlushingResponseWriter) Header() http.Header {
	if w.header == nil {
		w.header = make(http.Header)
	}
	return w.header
}

func (w *nonFlushingResponseWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.body.Write(p)
}

func (w *nonFlushingResponseWriter) WriteHeader(statusCode int) {
	w.status = statusCode
}

func TestRequireRealtimeSSEFlusher_ReturnsInternalErrorWithoutFlusher(t *testing.T) {
	t.Parallel()

	rw := &nonFlushingResponseWriter{}
	if _, ok := requireRealtimeSSEFlusher(rw); ok {
		t.Fatal("expected flusher check to fail")
	}
	if rw.status != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", rw.status, http.StatusInternalServerError)
	}
	if !strings.Contains(rw.body.String(), "streaming not supported") {
		t.Fatalf("body=%q, want streaming error", rw.body.String())
	}
}

func TestWriteRealtimeSSEHandshake_SetsHeadersAndPreamble(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	flusher, ok := requireRealtimeSSEFlusher(rr)
	if !ok {
		t.Fatal("expected recorder to implement flusher")
	}

	writeRealtimeSSEHandshake(rr, flusher)

	if got := rr.Header().Get("Content-Type"); got != "text/event-stream; charset=utf-8" {
		t.Fatalf("Content-Type=%q", got)
	}
	if got := rr.Header().Get("X-Accel-Buffering"); got != "no" {
		t.Fatalf("X-Accel-Buffering=%q", got)
	}
	if body := rr.Body.String(); body != ": ok\n\n" {
		t.Fatalf("body=%q, want %q", body, ": ok\n\n")
	}
}

func TestPrepareRealtimeWSConn_UpgradesConnection(t *testing.T) {
	t.Parallel()

	s := &server{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, ok := s.prepareRealtimeWSConn(w, r)
		if !ok {
			return
		}
		defer func() { _ = conn.Close() }()
		_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ok"))
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	header := http.Header{"Origin": []string{srv.URL}}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	msgType, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read message: %v", err)
	}
	if msgType != websocket.TextMessage {
		t.Fatalf("msgType=%d, want %d", msgType, websocket.TextMessage)
	}
	if string(payload) != "ok" {
		t.Fatalf("payload=%q, want %q", payload, "ok")
	}
}

package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestNewRealtimeSSESession_ProvidesHeartbeatEmitterAndRelease(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	session := newRealtimeSSESession(rr, rr)
	defer session.release()

	if session.heartbeat == nil {
		t.Fatal("expected heartbeat ticker")
	}
	session.emitter.writePing()
	if body := rr.Body.String(); body != ": ping\n\n" {
		t.Fatalf("body=%q, want %q", body, ": ping\n\n")
	}
}

func TestNewRealtimeWSSession_ReaderSignalsDoneOnPeerClose(t *testing.T) {
	t.Parallel()

	doneObserved := make(chan struct{})
	s := &server{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, ok := s.prepareRealtimeWSConn(w, r)
		if !ok {
			return
		}
		defer func() { _ = conn.Close() }()

		session := newRealtimeWSSession(conn)
		defer session.release()
		<-session.done
		close(doneObserved)
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	header := http.Header{"Origin": []string{srv.URL}}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	if err := conn.Close(); err != nil {
		t.Fatalf("close websocket: %v", err)
	}

	select {
	case <-doneObserved:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reader goroutine to signal done")
	}
}

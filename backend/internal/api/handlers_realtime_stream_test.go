package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"s3desk/internal/ws"
)

func TestServeRealtimeSSE_ReplaysBacklogBeforeExit(t *testing.T) {
	t.Parallel()

	hub := ws.NewHub()
	hub.Publish(ws.Event{Type: "job.created"})
	hub.Publish(ws.Event{Type: "job.completed"})

	s := &server{hub: hub}
	client, backlog, release := s.subscribeRealtime(1, true)
	defer release()

	rr := httptest.NewRecorder()
	session := newRealtimeSSESession(rr, rr)
	defer session.release()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	serveRealtimeSSE(ctx, client, backlog, session)

	body := rr.Body.String()
	if !strings.Contains(body, "id: 2\n") {
		t.Fatalf("body=%q, want backlog event id", body)
	}
	if !strings.Contains(body, "job.completed") {
		t.Fatalf("body=%q, want replayed payload", body)
	}
}

func TestServeRealtimeWS_ReplaysBacklogBeforeExit(t *testing.T) {
	t.Parallel()

	hub := ws.NewHub()
	hub.Publish(ws.Event{Type: "job.created"})
	hub.Publish(ws.Event{Type: "job.completed"})
	serverState := &server{hub: hub}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, ok := serverState.prepareRealtimeWSConn(w, r)
		if !ok {
			return
		}
		defer func() { _ = conn.Close() }()

		client, backlog, release := serverState.subscribeRealtime(1, true)
		defer release()

		session := newRealtimeWSSession(conn)
		defer session.release()

		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		serveRealtimeWS(ctx, client, backlog, session)
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
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read backlog message: %v", err)
	}
	if !strings.Contains(string(payload), "job.completed") {
		t.Fatalf("payload=%q, want replayed backlog payload", payload)
	}
}

package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"s3desk/internal/ws"
)

func TestRealtimeSSEEmitter_WriteMessage_WritesEventFrame(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	emitter := newRealtimeSSEEmitter(rr, rr)
	emitter.writeMessage(ws.Message{Seq: 7, Data: []byte(`{"type":"job.created"}`)})

	if body := rr.Body.String(); body != "id: 7\ndata: {\"type\":\"job.created\"}\n\n" {
		t.Fatalf("body=%q", body)
	}
}

func TestRealtimeSSEEmitter_WritePing_WritesHeartbeatFrame(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	emitter := newRealtimeSSEEmitter(rr, rr)
	emitter.writePing()

	if body := rr.Body.String(); body != ": ping\n\n" {
		t.Fatalf("body=%q, want %q", body, ": ping\n\n")
	}
}

func TestRealtimeWSEmitter_Replay_WritesBacklogInOrder(t *testing.T) {
	t.Parallel()

	s := &server{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, ok := s.prepareRealtimeWSConn(w, r)
		if !ok {
			return
		}
		defer func() { _ = conn.Close() }()

		emitter := newRealtimeWSEmitter(conn)
		_ = emitter.replay([]ws.Message{
			{Seq: 1, Data: []byte("one")},
			{Seq: 2, Data: []byte("two")},
		})
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
		t.Fatalf("read first message: %v", err)
	}
	if string(payload) != "one" {
		t.Fatalf("first payload=%q, want %q", payload, "one")
	}
	_, payload, err = conn.ReadMessage()
	if err != nil {
		t.Fatalf("read second message: %v", err)
	}
	if string(payload) != "two" {
		t.Fatalf("second payload=%q, want %q", payload, "two")
	}
}

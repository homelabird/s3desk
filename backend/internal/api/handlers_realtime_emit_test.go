package api

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"s3desk/internal/ws"
)

type deadlineFailureSSEWriter struct {
	*httptest.ResponseRecorder
	failReset bool
}

func (w *deadlineFailureSSEWriter) SetWriteDeadline(deadline time.Time) error {
	if deadline.IsZero() == w.failReset {
		return io.ErrClosedPipe
	}
	return nil
}

func TestRealtimeSSEEmitterStopsWhenWriteDeadlineFails(t *testing.T) {
	for _, failReset := range []bool{false, true} {
		t.Run(map[bool]string{false: "set", true: "reset"}[failReset], func(t *testing.T) {
			writer := &deadlineFailureSSEWriter{ResponseRecorder: httptest.NewRecorder(), failReset: failReset}
			if err := newRealtimeSSEEmitter(writer).writePing(); !errors.Is(err, io.ErrClosedPipe) {
				t.Fatalf("error=%v, want client deadline failure", err)
			}
			if !failReset && writer.Body.Len() != 0 {
				t.Fatal("wrote an unbounded frame after failing to set its deadline")
			}
		})
	}
}

func TestRealtimeSSEEmitter_WriteMessage_WritesEventFrame(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	emitter := newRealtimeSSEEmitter(rr)
	if err := emitter.writeMessage(ws.Message{Seq: 7, Data: []byte(`{"type":"job.created"}`)}); err != nil {
		t.Fatal(err)
	}

	if body := rr.Body.String(); body != "id: 7\ndata: {\"type\":\"job.created\"}\n\n" {
		t.Fatalf("body=%q", body)
	}
}

func TestRealtimeSSEEmitter_WritePing_WritesHeartbeatFrame(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	emitter := newRealtimeSSEEmitter(rr)
	if err := emitter.writePing(); err != nil {
		t.Fatal(err)
	}

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

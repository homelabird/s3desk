package api

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"

	"s3desk/internal/ws"
)

type failingSSEWriter struct {
	*httptest.ResponseRecorder
	failWrite bool
	deadlines []time.Time
}

func (w *failingSSEWriter) Write(p []byte) (int, error) {
	if w.failWrite {
		return 0, io.ErrClosedPipe
	}
	return w.ResponseRecorder.Write(p)
}

func (w *failingSSEWriter) FlushError() error { return io.ErrClosedPipe }

func (w *failingSSEWriter) SetWriteDeadline(deadline time.Time) error {
	w.deadlines = append(w.deadlines, deadline)
	return nil
}

func TestServeRealtimeSSEExitsOnWriteOrFlushFailure(t *testing.T) {
	for _, source := range []string{"replay", "event", "heartbeat"} {
		for _, failWrite := range []bool{true, false} {
			t.Run(source+"/"+map[bool]string{true: "write", false: "flush"}[failWrite], func(t *testing.T) {
				hub := ws.NewHub()
				client := hub.Subscribe()
				defer hub.Unsubscribe(client)
				message := ws.Message{Seq: 1, Data: []byte(`{"type":"job.created"}`)}
				var backlog []ws.Message
				if source == "replay" {
					backlog = []ws.Message{message, message}
				} else if source == "event" {
					hub.Publish(ws.Event{Type: "job.created"})
				}
				writer := &failingSSEWriter{ResponseRecorder: httptest.NewRecorder(), failWrite: failWrite}
				session := newRealtimeSSESession(writer)
				defer session.release()
				if source == "heartbeat" {
					session.heartbeat.Reset(time.Millisecond)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
				defer cancel()
				serveRealtimeSSE(ctx, client, backlog, session)
				if ctx.Err() != nil {
					t.Fatal("stream kept its handler after the client write failed")
				}
				if len(writer.deadlines) != 2 || !writer.deadlines[0].After(time.Now()) {
					t.Fatal("stream did not bound the client write")
				}
				if !writer.deadlines[1].IsZero() {
					t.Fatal("stream left a write deadline active between heartbeats")
				}
			})
		}
	}
}

func TestRealtimeSSEHandshakeFailureReleasesSlot(t *testing.T) {
	for _, failWrite := range []bool{true, false} {
		t.Run(map[bool]string{true: "write", false: "flush"}[failWrite], func(t *testing.T) {
			s := &server{hub: ws.NewHub()}
			released := false
			writer := &failingSSEWriter{ResponseRecorder: httptest.NewRecorder(), failWrite: failWrite}
			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()
			handler := s.requestLogger(middleware.Compress(5)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				newRealtimeSSEHTTPService(s).executePrepared(r.Context(), w, realtimeSSEPreparedRequest{
					releaseSlot: func() { released = true },
				})
			})))
			request := httptest.NewRequest(http.MethodGet, "/api/v1/events", nil).WithContext(ctx)
			request.Header.Set("Accept-Encoding", "gzip")
			handler.ServeHTTP(writer, request)
			if ctx.Err() != nil {
				t.Fatal("handshake failure kept its handler until context cancellation")
			}
			if !released {
				t.Fatal("handshake failure did not release the realtime slot")
			}
			if len(writer.deadlines) != 2 || !writer.deadlines[0].After(time.Now()) || !writer.deadlines[1].IsZero() {
				t.Fatalf("write deadlines=%v, want bounded write followed by idle reset", writer.deadlines)
			}
		})
	}
}

func TestServeRealtimeSSE_ReplaysBacklogBeforeExit(t *testing.T) {
	t.Parallel()

	hub := ws.NewHub()
	hub.Publish(ws.Event{Type: "job.created"})
	hub.Publish(ws.Event{Type: "job.completed"})

	s := &server{hub: hub}
	client, backlog, release := s.subscribeRealtime(1, true)
	defer release()

	rr := httptest.NewRecorder()
	session := newRealtimeSSESession(rr)
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

func TestRealtimeWSExitsWhenShutdownContextIsCanceled(t *testing.T) {
	hub := ws.NewHub()
	shutdownCtx, shutdown := context.WithCancel(context.Background())
	serverState := &server{hub: hub, shutdownContext: shutdownCtx}
	handlerDone := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, ok := serverState.prepareRealtimeWSConn(w, r)
		if !ok {
			return
		}
		defer func() { _ = conn.Close() }()

		client, backlog, release := serverState.subscribeRealtime(0, true)
		defer release()
		session := newRealtimeWSSession(conn)
		defer session.release()
		streamCtx, releaseContext := serverState.withRealtimeShutdown(r.Context())
		defer releaseContext()
		serveRealtimeWS(streamCtx, client, backlog, session)
		close(handlerDone)
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	header := http.Header{"Origin": []string{srv.URL}}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	shutdown()
	select {
	case <-handlerDone:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for websocket handler shutdown")
	}
}

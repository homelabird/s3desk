package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

func requireRealtimeSSEFlusher(w http.ResponseWriter) (http.Flusher, bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal_error", "streaming not supported", nil)
		return nil, false
	}
	return flusher, true
}

func writeRealtimeSSEHandshake(w http.ResponseWriter, flusher http.Flusher) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	_, _ = fmt.Fprintf(w, ": ok\n\n")
	flusher.Flush()
}

func (s *server) prepareRealtimeWSConn(w http.ResponseWriter, r *http.Request) (*websocket.Conn, bool) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     s.checkWebSocketOrigin,
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return nil, false
	}
	configureRealtimeWSConn(conn)
	return conn, true
}

func configureRealtimeWSConn(conn *websocket.Conn) {
	conn.SetReadLimit(64 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
}

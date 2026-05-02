package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"s3desk/internal/ws"
)

type realtimeSSEEmitter struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

func newRealtimeSSEEmitter(w http.ResponseWriter, flusher http.Flusher) realtimeSSEEmitter {
	return realtimeSSEEmitter{w: w, flusher: flusher}
}

func (e realtimeSSEEmitter) replay(backlog []ws.Message) {
	for _, msg := range backlog {
		e.writeMessage(msg)
	}
}

func (e realtimeSSEEmitter) writeMessage(msg ws.Message) {
	_, _ = fmt.Fprintf(e.w, "id: %d\n", msg.Seq)
	_, _ = fmt.Fprintf(e.w, "data: %s\n\n", msg.Data)
	e.flusher.Flush()
}

func (e realtimeSSEEmitter) writePing() {
	_, _ = fmt.Fprintf(e.w, ": ping\n\n")
	e.flusher.Flush()
}

type realtimeWSEmitter struct {
	conn *websocket.Conn
}

func newRealtimeWSEmitter(conn *websocket.Conn) realtimeWSEmitter {
	return realtimeWSEmitter{conn: conn}
}

func (e realtimeWSEmitter) replay(backlog []ws.Message) error {
	for _, msg := range backlog {
		if err := e.writeMessage(msg); err != nil {
			return err
		}
	}
	return nil
}

func (e realtimeWSEmitter) writeMessage(msg ws.Message) error {
	if err := e.setWriteDeadline(); err != nil {
		return err
	}
	return e.conn.WriteMessage(websocket.TextMessage, msg.Data)
}

func (e realtimeWSEmitter) writePing() error {
	if err := e.setWriteDeadline(); err != nil {
		return err
	}
	return e.conn.WriteMessage(websocket.PingMessage, nil)
}

func (e realtimeWSEmitter) setWriteDeadline() error {
	return e.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
}

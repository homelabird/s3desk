package api

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"s3desk/internal/ws"
)

type realtimeSSEEmitter struct {
	w          http.ResponseWriter
	controller *http.ResponseController
}

func newRealtimeSSEEmitter(w http.ResponseWriter) realtimeSSEEmitter {
	controlWriter := w
	// SSE is uncompressed; unwrap middleware whose Flush methods hide client errors.
	for {
		wrapper, ok := controlWriter.(interface{ Unwrap() http.ResponseWriter })
		if !ok {
			break
		}
		controlWriter = wrapper.Unwrap()
	}
	return realtimeSSEEmitter{w: w, controller: http.NewResponseController(controlWriter)}
}

func (e realtimeSSEEmitter) replay(backlog []ws.Message) error {
	for _, msg := range backlog {
		if err := e.writeMessage(msg); err != nil {
			return err
		}
	}
	return nil
}

func (e realtimeSSEEmitter) writeMessage(msg ws.Message) error {
	return e.writeFrame("id: %d\ndata: %s\n\n", msg.Seq, msg.Data)
}

func (e realtimeSSEEmitter) writePing() error {
	return e.writeFrame(": ping\n\n")
}

func (e realtimeSSEEmitter) writeFrame(format string, args ...any) error {
	if err := e.controller.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil && !errors.Is(err, http.ErrNotSupported) {
		return err
	}
	_, err := fmt.Fprintf(e.w, format, args...)
	if err == nil {
		err = e.controller.Flush()
	}
	// Keep the idle heartbeat interval from expiring an HTTP/2 stream's write timer.
	if resetErr := e.controller.SetWriteDeadline(time.Time{}); err == nil && resetErr != nil && !errors.Is(resetErr, http.ErrNotSupported) {
		return resetErr
	}
	return err
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

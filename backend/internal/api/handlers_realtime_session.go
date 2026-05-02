package api

import (
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

type realtimeSSESession struct {
	emitter   realtimeSSEEmitter
	heartbeat *time.Ticker
}

func newRealtimeSSESession(w http.ResponseWriter, flusher http.Flusher) realtimeSSESession {
	return realtimeSSESession{
		emitter:   newRealtimeSSEEmitter(w, flusher),
		heartbeat: time.NewTicker(15 * time.Second),
	}
}

func (s realtimeSSESession) release() {
	s.heartbeat.Stop()
}

type realtimeWSSession struct {
	emitter realtimeWSEmitter
	done    <-chan struct{}
	ping    *time.Ticker
}

func newRealtimeWSSession(conn *websocket.Conn) realtimeWSSession {
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				return
			}
		}
	}()
	return realtimeWSSession{
		emitter: newRealtimeWSEmitter(conn),
		done:    done,
		ping:    time.NewTicker(30 * time.Second),
	}
}

func (s realtimeWSSession) release() {
	s.ping.Stop()
}

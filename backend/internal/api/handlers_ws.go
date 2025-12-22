package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

func (s *server) handleWS(w http.ResponseWriter, r *http.Request) {
	s.handleWSUpgrade(w, r)
}

func (s *server) handleWSUpgrade(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = conn.Close() }()

	var afterSeq int64
	if raw := r.URL.Query().Get("afterSeq"); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil && v > 0 {
			afterSeq = v
		}
	}

	includeLogs := true
	if raw := r.URL.Query().Get("includeLogs"); raw != "" {
		if v, err := strconv.ParseBool(raw); err == nil {
			includeLogs = v
		}
	}

	client, backlog := s.hub.SubscribeFrom(afterSeq, includeLogs)
	defer s.hub.Unsubscribe(client)

	conn.SetReadLimit(64 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

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

	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()

	for _, msg := range backlog {
		_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if err := conn.WriteMessage(websocket.TextMessage, msg.Data); err != nil {
			return
		}
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case <-done:
			return
		case <-ping.C:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case msg, ok := <-client.Messages():
			if !ok {
				return
			}
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, msg.Data); err != nil {
				return
			}
		}
	}
}

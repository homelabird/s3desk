package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"
)

func (s *server) handleEventsSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal_error", "streaming not supported", nil)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	_, _ = fmt.Fprintf(w, ": ok\n\n")
	flusher.Flush()

	var afterSeq int64
	if raw := r.Header.Get("Last-Event-ID"); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil && v > 0 {
			afterSeq = v
		}
	}
	if afterSeq == 0 {
		if raw := r.URL.Query().Get("afterSeq"); raw != "" {
			if v, err := strconv.ParseInt(raw, 10, 64); err == nil && v > 0 {
				afterSeq = v
			}
		}
	}
	if afterSeq > 0 && s.metrics != nil {
		s.metrics.IncEventsReconnects()
	}

	includeLogs := true
	if raw := r.URL.Query().Get("includeLogs"); raw != "" {
		if v, err := strconv.ParseBool(raw); err == nil {
			includeLogs = v
		}
	}

	client, backlog := s.hub.SubscribeFrom(afterSeq, includeLogs)
	defer s.hub.Unsubscribe(client)
	if s.metrics != nil {
		s.metrics.IncEventsConnections()
		defer s.metrics.DecEventsConnections()
	}

	for _, msg := range backlog {
		_, _ = fmt.Fprintf(w, "id: %d\n", msg.Seq)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", msg.Data)
		flusher.Flush()
	}

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			_, _ = fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case msg, ok := <-client.Messages():
			if !ok {
				return
			}
			_, _ = fmt.Fprintf(w, "id: %d\n", msg.Seq)
			_, _ = fmt.Fprintf(w, "data: %s\n\n", msg.Data)
			flusher.Flush()
		}
	}
}

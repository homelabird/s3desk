package api

import (
	"net/http"
	"strconv"

	"s3desk/internal/ws"
)

func parseRealtimeAfterSeq(r *http.Request, headerName string) int64 {
	if headerName != "" {
		if raw := r.Header.Get(headerName); raw != "" {
			if v, err := strconv.ParseInt(raw, 10, 64); err == nil && v > 0 {
				return v
			}
		}
	}
	if raw := r.URL.Query().Get("afterSeq"); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil && v > 0 {
			return v
		}
	}
	return 0
}

func parseRealtimeIncludeLogs(r *http.Request) bool {
	includeLogs := true
	if raw := r.URL.Query().Get("includeLogs"); raw != "" {
		if v, err := strconv.ParseBool(raw); err == nil {
			includeLogs = v
		}
	}
	return includeLogs
}

func (s *server) prepareRealtimeRequest(w http.ResponseWriter, r *http.Request, transport, originMessage, resumeHeader string) (int64, bool, func(), bool) {
	releaseSlot, allowed := s.acquireRealtimeSlot(w, transport)
	if !allowed {
		return 0, false, nil, false
	}
	if s.rejectInvalidRealtimeOrigin(w, r, originMessage) {
		releaseSlot()
		return 0, false, nil, false
	}

	afterSeq := parseRealtimeAfterSeq(r, resumeHeader)
	if afterSeq > 0 && s.metrics != nil {
		s.metrics.IncEventsReconnects()
	}

	return afterSeq, parseRealtimeIncludeLogs(r), releaseSlot, true
}

func (s *server) subscribeRealtime(afterSeq int64, includeLogs bool) (*ws.Client, []ws.Message, func()) {
	client, backlog := s.hub.SubscribeFrom(afterSeq, includeLogs)
	if s.metrics != nil {
		s.metrics.IncEventsConnections()
	}
	return client, backlog, func() {
		s.hub.Unsubscribe(client)
		if s.metrics != nil {
			s.metrics.DecEventsConnections()
		}
	}
}

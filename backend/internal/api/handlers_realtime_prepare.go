package api

import (
	"net/http"
	"strconv"
	"strings"

	"s3desk/internal/ws"
)

type realtimeAfterSeqParse struct {
	value        int64
	invalidField string
	invalidValue string
	ok           bool
}

func parseRealtimeSeqValue(raw string) (int64, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, false
	}
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || v < 0 {
		return 0, false
	}
	return v, true
}

func parseRealtimeAfterSeq(r *http.Request, headerName string) realtimeAfterSeqParse {
	if headerName != "" {
		if raw := r.Header.Get(headerName); raw != "" {
			if v, ok := parseRealtimeSeqValue(raw); ok {
				return realtimeAfterSeqParse{value: v, ok: true}
			}
			return realtimeAfterSeqParse{invalidField: headerName, invalidValue: raw, ok: false}
		}
	}
	if rawValues, exists := r.URL.Query()["afterSeq"]; exists {
		raw := ""
		if len(rawValues) > 0 {
			raw = rawValues[0]
		}
		if v, ok := parseRealtimeSeqValue(raw); ok {
			return realtimeAfterSeqParse{value: v, ok: true}
		}
		return realtimeAfterSeqParse{invalidField: "afterSeq", invalidValue: raw, ok: false}
	}
	return realtimeAfterSeqParse{value: 0, ok: true}
}

func parseRealtimeIncludeLogs(r *http.Request) (bool, bool) {
	includeLogs := true
	if raw := r.URL.Query().Get("includeLogs"); raw != "" {
		v, err := strconv.ParseBool(raw)
		if err != nil {
			return false, false
		}
		includeLogs = v
	}
	return includeLogs, true
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

	afterSeqParse := parseRealtimeAfterSeq(r, resumeHeader)
	if !afterSeqParse.ok {
		releaseSlot()
		writeError(w, http.StatusBadRequest, "invalid_request", afterSeqParse.invalidField+" must be a non-negative integer", map[string]any{afterSeqParse.invalidField: afterSeqParse.invalidValue})
		return 0, false, nil, false
	}
	afterSeq := afterSeqParse.value
	if afterSeq > 0 && s.metrics != nil {
		s.metrics.IncEventsReconnects()
	}

	includeLogs, ok := parseRealtimeIncludeLogs(r)
	if !ok {
		releaseSlot()
		writeError(w, http.StatusBadRequest, "invalid_request", "includeLogs must be a boolean", map[string]any{"includeLogs": r.URL.Query().Get("includeLogs")})
		return 0, false, nil, false
	}

	return afterSeq, includeLogs, releaseSlot, true
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

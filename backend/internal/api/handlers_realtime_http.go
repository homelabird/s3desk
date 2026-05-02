package api

import (
	"context"
	"net/http"

	"github.com/gorilla/websocket"
)

type realtimeSSEPreparedRequest struct {
	flusher     http.Flusher
	afterSeq    int64
	includeLogs bool
	releaseSlot func()
}

type realtimeWSPreparedRequest struct {
	conn        *websocket.Conn
	afterSeq    int64
	includeLogs bool
	releaseSlot func()
}

type realtimeSSEHTTPService struct {
	server *server
}

type realtimeWSHTTPService struct {
	server *server
}

func newRealtimeSSEHTTPService(s *server) realtimeSSEHTTPService {
	return realtimeSSEHTTPService{server: s}
}

func newRealtimeWSHTTPService(s *server) realtimeWSHTTPService {
	return realtimeWSHTTPService{server: s}
}

func (svc realtimeSSEHTTPService) prepareEventsSSE(w http.ResponseWriter, r *http.Request) (realtimeSSEPreparedRequest, bool) {
	flusher, ok := requireRealtimeSSEFlusher(w)
	if !ok {
		return realtimeSSEPreparedRequest{}, false
	}

	afterSeq, includeLogs, releaseSlot, ok := svc.server.prepareRealtimeRequest(w, r, "sse", "realtime requests require a trusted Origin", "Last-Event-ID")
	if !ok {
		return realtimeSSEPreparedRequest{}, false
	}

	return realtimeSSEPreparedRequest{flusher: flusher, afterSeq: afterSeq, includeLogs: includeLogs, releaseSlot: releaseSlot}, true
}

func (svc realtimeSSEHTTPService) executePrepared(ctx context.Context, w http.ResponseWriter, prepared realtimeSSEPreparedRequest) {
	defer prepared.releaseSlot()

	writeRealtimeSSEHandshake(w, prepared.flusher)

	client, backlog, release := svc.server.subscribeRealtime(prepared.afterSeq, prepared.includeLogs)
	defer release()

	session := newRealtimeSSESession(w, prepared.flusher)
	defer session.release()

	serveRealtimeSSE(ctx, client, backlog, session)
}

func (svc realtimeSSEHTTPService) handleEventsSSE(w http.ResponseWriter, r *http.Request) {
	_ = svc.executeGet(w, r)
}

func (svc realtimeSSEHTTPService) executeGet(w http.ResponseWriter, r *http.Request) bool {
	prepared, ok := svc.prepareEventsSSE(w, r)
	if !ok {
		return false
	}
	svc.executePrepared(r.Context(), w, prepared)
	return true
}

func (svc realtimeWSHTTPService) prepareUpgrade(w http.ResponseWriter, r *http.Request) (realtimeWSPreparedRequest, bool) {
	afterSeq, includeLogs, releaseSlot, ok := svc.server.prepareRealtimeRequest(w, r, "ws", "realtime requests require a trusted Origin", "")
	if !ok {
		return realtimeWSPreparedRequest{}, false
	}

	conn, ok := svc.server.prepareRealtimeWSConn(w, r)
	if !ok {
		releaseSlot()
		return realtimeWSPreparedRequest{}, false
	}

	return realtimeWSPreparedRequest{conn: conn, afterSeq: afterSeq, includeLogs: includeLogs, releaseSlot: releaseSlot}, true
}

func (svc realtimeWSHTTPService) executePrepared(ctx context.Context, prepared realtimeWSPreparedRequest) {
	defer prepared.releaseSlot()
	defer func() { _ = prepared.conn.Close() }()

	client, backlog, release := svc.server.subscribeRealtime(prepared.afterSeq, prepared.includeLogs)
	defer release()

	session := newRealtimeWSSession(prepared.conn)
	defer session.release()

	serveRealtimeWS(ctx, client, backlog, session)
}

func (svc realtimeWSHTTPService) handleWSUpgrade(w http.ResponseWriter, r *http.Request) {
	_ = svc.executeUpgrade(w, r)
}

func (svc realtimeWSHTTPService) executeUpgrade(w http.ResponseWriter, r *http.Request) bool {
	prepared, ok := svc.prepareUpgrade(w, r)
	if !ok {
		return false
	}
	svc.executePrepared(r.Context(), prepared)
	return true
}

package api

import "net/http"

const defaultRealtimeMaxConnections = 64

type requestLimiter struct {
	ch chan struct{}
}

func newRequestLimiter(max int) *requestLimiter {
	if max <= 0 {
		return nil
	}
	return &requestLimiter{ch: make(chan struct{}, max)}
}

func (l *requestLimiter) tryAcquire() bool {
	select {
	case l.ch <- struct{}{}:
		return true
	default:
		return false
	}
}

func (l *requestLimiter) release() {
	select {
	case <-l.ch:
	default:
	}
}

func (s *server) acquireUploadSlot(w http.ResponseWriter) (func(), bool) {
	if s.uploadLimit == nil {
		return func() {}, true
	}
	if s.uploadLimit.tryAcquire() {
		return s.uploadLimit.release, true
	}
	w.Header().Set("Retry-After", "2")
	writeError(w, http.StatusTooManyRequests, "rate_limited", "too many concurrent upload requests", map[string]any{
		"limit": s.cfg.UploadMaxConcurrentRequests,
	})
	return nil, false
}

func (s *server) acquireRealtimeSlot(w http.ResponseWriter, transport string) (func(), bool) {
	if s.realtimeLimit == nil {
		return func() {}, true
	}
	if s.realtimeLimit.tryAcquire() {
		return s.realtimeLimit.release, true
	}
	limit := s.realtimeMax
	if limit <= 0 {
		limit = defaultRealtimeMaxConnections
	}
	w.Header().Set("Retry-After", "2")
	writeError(w, http.StatusTooManyRequests, "rate_limited", "too many concurrent realtime connections", map[string]any{
		"limit":     limit,
		"transport": transport,
	})
	return nil, false
}

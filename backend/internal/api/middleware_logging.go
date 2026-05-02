package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"s3desk/internal/logging"
	"s3desk/internal/metrics"
)

func buildRequestLogResult(r *http.Request, status int, bytes int, duration time.Duration) (int, time.Duration, string, string, map[string]any) {
	if status == 0 {
		status = http.StatusOK
	}
	route := routePattern(r)
	fields := map[string]any{
		"event":       "http.request",
		"method":      r.Method,
		"path":        r.URL.Path,
		"status":      status,
		"duration_ms": duration.Milliseconds(),
		"bytes":       bytes,
		"remote_addr": requestRemoteAddr(r),
		"user_agent":  r.UserAgent(),
		"proto":       r.Proto,
	}
	if reqID := middleware.GetReqID(r.Context()); reqID != "" {
		fields["request_id"] = reqID
	}
	if route != "" {
		fields["route"] = route
	}
	if profileID := r.Header.Get("X-Profile-Id"); profileID != "" {
		fields["profile_id"] = profileID
	}
	if r.URL != nil && r.URL.Query().Get("apiToken") != "" {
		fields["apiToken_source"] = "query_blocked"
	}
	return status, duration, route, r.URL.Path, fields
}

func observeRequestMetrics(m *metrics.Metrics, method string, route string, status int, duration time.Duration) {
	if m == nil {
		return
	}
	m.ObserveHTTPRequest(method, route, status, duration)
}

func writeRequestLog(status int, path string, fields map[string]any) {
	if shouldSkipAccessLogPath(path) {
		return
	}
	switch {
	case status >= http.StatusInternalServerError:
		logging.ErrorFields("http request failed", fields)
	case status >= http.StatusBadRequest:
		logging.WarnFields("http request warning", fields)
	default:
		logging.InfoFields("http request", fields)
	}
}

func shouldSkipAccessLogPath(path string) bool {
	return path == "/healthz" || path == "/readyz" || path == "/metrics"
}

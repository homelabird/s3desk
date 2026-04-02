package api

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

const corsExposeHeaders = "Retry-After, Content-Disposition, X-Log-Next-Offset, X-Upload-Skipped"
const corsAllowHeaders = "Authorization, Content-Type, X-Api-Token, X-Profile-Id, X-Upload-Chunk-Index, X-Upload-Chunk-Total, X-Upload-Chunk-Size, X-Upload-File-Size, X-Upload-Relative-Path"
const defaultContentSecurityPolicy = "base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
const defaultPermissionsPolicy = "accelerometer=(), autoplay=(), camera=(), geolocation=(), magnetometer=(), microphone=(), payment=(), usb=(), gyroscope=(), clipboard-read=(), clipboard-write=()"

const maxAPITokenBytes = 4096

var allowedHTTPMethods = []string{
	http.MethodGet,
	http.MethodHead,
	http.MethodPost,
	http.MethodPut,
	http.MethodPatch,
	http.MethodDelete,
	http.MethodOptions,
}

type authFailureLimiter struct {
	mu          sync.Mutex
	entries     map[string]authFailureEntry
	maxFailures int
	window      time.Duration
	lockout     time.Duration
}

type authFailureEntry struct {
	failures     []time.Time
	blockedUntil time.Time
	lastSeen     time.Time
}

func newAuthFailureLimiter(maxFailures int, window time.Duration, lockout time.Duration) *authFailureLimiter {
	if maxFailures <= 0 || window <= 0 || lockout <= 0 {
		return nil
	}
	return &authFailureLimiter{
		entries:     make(map[string]authFailureEntry),
		maxFailures: maxFailures,
		window:      window,
		lockout:     lockout,
	}
}

func (l *authFailureLimiter) allow(key string, now time.Time) (time.Duration, bool) {
	if l == nil || key == "" {
		return 0, true
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	l.pruneLocked(now)
	entry, ok := l.entries[key]
	if !ok {
		return 0, true
	}
	entry.failures = trimAuthFailures(entry.failures, now, l.window)
	entry.lastSeen = now
	if entry.blockedUntil.After(now) {
		l.entries[key] = entry
		return entry.blockedUntil.Sub(now), false
	}
	if len(entry.failures) == 0 {
		delete(l.entries, key)
		return 0, true
	}
	l.entries[key] = entry
	return 0, true
}

func (l *authFailureLimiter) recordFailure(key string, now time.Time) time.Duration {
	if l == nil || key == "" {
		return 0
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	l.pruneLocked(now)
	entry := l.entries[key]
	entry.failures = trimAuthFailures(entry.failures, now, l.window)
	entry.failures = append(entry.failures, now)
	entry.lastSeen = now
	if len(entry.failures) >= l.maxFailures {
		entry.blockedUntil = now.Add(l.lockout)
	}
	l.entries[key] = entry
	if entry.blockedUntil.After(now) {
		return entry.blockedUntil.Sub(now)
	}
	return 0
}

func (l *authFailureLimiter) reset(key string) {
	if l == nil || key == "" {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

func (l *authFailureLimiter) pruneLocked(now time.Time) {
	staleAfter := l.window
	if l.lockout > staleAfter {
		staleAfter = l.lockout
	}
	staleAfter *= 2
	for key, entry := range l.entries {
		entry.failures = trimAuthFailures(entry.failures, now, l.window)
		if entry.blockedUntil.Before(now) && len(entry.failures) == 0 && now.Sub(entry.lastSeen) >= staleAfter {
			delete(l.entries, key)
			continue
		}
		l.entries[key] = entry
	}
}

func trimAuthFailures(failures []time.Time, now time.Time, window time.Duration) []time.Time {
	if len(failures) == 0 {
		return failures
	}
	cutoff := now.Add(-window)
	idx := 0
	for idx < len(failures) && failures[idx].Before(cutoff) {
		idx++
	}
	if idx == 0 {
		return failures
	}
	return append([]time.Time(nil), failures[idx:]...)
}

func apiTokenEqual(actual string, expected string) bool {
	actualSum := sha256.Sum256([]byte(actual))
	expectedSum := sha256.Sum256([]byte(expected))
	return subtle.ConstantTimeCompare(actualSum[:], expectedSum[:]) == 1
}

func (s *server) requireAPIToken(next http.Handler) http.Handler {
	if s.cfg.APIToken == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientKey := authLimiterClientKey(r)
		now := time.Now()
		if retryAfter, allowed := s.authLimit.allow(clientKey, now); !allowed {
			w.Header().Set("Retry-After", formatRetryAfterSeconds(retryAfter))
			writeError(w, http.StatusTooManyRequests, "too_many_attempts", "too many authentication attempts", map[string]any{
				"retryAfterSeconds": int(mathCeilSeconds(retryAfter)),
			})
			return
		}

		query := r.URL.Query()
		if queryAPIToken := strings.TrimSpace(query.Get("apiToken")); queryAPIToken != "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "apiToken query parameter is not supported; use X-Api-Token or Authorization: Bearer", nil)
			return
		}

		token := strings.TrimSpace(r.Header.Get("X-Api-Token"))
		if token == "" {
			// Prometheus/ServiceMonitor and many HTTP clients support Bearer tokens
			// out of the box, so accept Authorization: Bearer <token> as an alias.
			if auth := strings.TrimSpace(r.Header.Get("Authorization")); auth != "" {
				if parts := strings.SplitN(auth, " ", 2); len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
					token = strings.TrimSpace(parts[1])
				}
			}
		}
		if token == "" && (isWebSocketUpgrade(r) || isSSERequest(r)) {
			realtimeTicket := strings.TrimSpace(query.Get("realtimeTicket"))
			if realtimeTicket != "" {
				if s.rejectInvalidRealtimeOrigin(w, r, "realtime requests require a trusted Origin") {
					return
				}
				transport := "sse"
				if isWebSocketUpgrade(r) {
					transport = "ws"
				}
				if s.realtimeTickets != nil && s.realtimeTickets.Consume(realtimeTicket, transport, now) {
					s.authLimit.reset(clientKey)
					next.ServeHTTP(w, r)
					return
				}
				retryAfter := s.authLimit.recordFailure(clientKey, now)
				if retryAfter > 0 {
					w.Header().Set("Retry-After", formatRetryAfterSeconds(retryAfter))
				}
				writeError(w, http.StatusUnauthorized, "unauthorized", "invalid realtime ticket", nil)
				return
			}
		}
		if token != "" && hasUnsafeTokenValue(token) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid api token", nil)
			return
		}
		if len(token) > maxAPITokenBytes {
			retryAfter := s.authLimit.recordFailure(clientKey, now)
			if retryAfter > 0 {
				w.Header().Set("Retry-After", formatRetryAfterSeconds(retryAfter))
			}
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid api token", nil)
			return
		}
		if !apiTokenEqual(token, s.cfg.APIToken) {
			retryAfter := s.authLimit.recordFailure(clientKey, now)
			if retryAfter > 0 {
				w.Header().Set("Retry-After", formatRetryAfterSeconds(retryAfter))
			}
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid api token", nil)
			return
		}
		s.authLimit.reset(clientKey)
		next.ServeHTTP(w, r)
	})
}

func authLimiterClientKey(r *http.Request) string {
	host := r.RemoteAddr
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.TrimSpace(host)
	if host == "" {
		return "unknown"
	}
	return host
}

func formatRetryAfterSeconds(d time.Duration) string {
	seconds := mathCeilSeconds(d)
	if seconds < 1 {
		seconds = 1
	}
	return strconv.Itoa(int(seconds))
}

func mathCeilSeconds(d time.Duration) int64 {
	if d <= 0 {
		return 0
	}
	seconds := d / time.Second
	if d%time.Second != 0 {
		seconds++
	}
	return int64(seconds)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		if h.Get("X-Frame-Options") == "" {
			h.Set("X-Frame-Options", "DENY")
		}
		if h.Get("Content-Security-Policy") == "" {
			h.Set("Content-Security-Policy", defaultContentSecurityPolicy)
		}
		if h.Get("Cross-Origin-Opener-Policy") == "" && isTrustworthyOrigin(r) {
			// Keep popup/Window targeting isolated for trusted local/UI requests.
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
		}
		if h.Get("Cross-Origin-Resource-Policy") == "" {
			h.Set("Cross-Origin-Resource-Policy", "same-origin")
		}
		if h.Get("Origin-Agent-Cluster") == "" {
			h.Set("Origin-Agent-Cluster", "?1")
		}
		if h.Get("Permissions-Policy") == "" {
			h.Set("Permissions-Policy", defaultPermissionsPolicy)
		}
		if h.Get("X-Permitted-Cross-Domain-Policies") == "" {
			h.Set("X-Permitted-Cross-Domain-Policies", "none")
		}
		if h.Get("X-Content-Type-Options") == "" {
			h.Set("X-Content-Type-Options", "nosniff")
		}
		if h.Get("Referrer-Policy") == "" {
			h.Set("Referrer-Policy", "no-referrer")
		}
		if h.Get("Strict-Transport-Security") == "" && r.TLS != nil {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}
		next.ServeHTTP(w, r)
	})
}

func isTrustworthyOrigin(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.ToLower(strings.TrimSpace(host))
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func isWebSocketUpgrade(r *http.Request) bool {
	if strings.ToLower(r.Header.Get("Upgrade")) != "websocket" {
		return false
	}
	return strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}

func isSSERequest(r *http.Request) bool {
	return strings.Contains(strings.ToLower(r.Header.Get("Accept")), "text/event-stream")
}

func (s *server) requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}
		duration := time.Since(start)
		route := routePattern(r)
		if s.metrics != nil {
			s.metrics.ObserveHTTPRequest(r.Method, route, status, duration)
		}
		if shouldSkipAccessLog(r) {
			return
		}

		fields := map[string]any{
			"event":       "http.request",
			"method":      r.Method,
			"path":        r.URL.Path,
			"status":      status,
			"duration_ms": duration.Milliseconds(),
			"bytes":       ww.BytesWritten(),
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

		if status >= http.StatusInternalServerError {
			logging.ErrorFields("http request failed", fields)
			return
		}
		if status >= http.StatusBadRequest {
			logging.WarnFields("http request warning", fields)
			return
		}
		logging.InfoFields("http request", fields)
	})
}

func (s *server) allowOnlySafeMethods(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch strings.ToUpper(r.Method) {
		case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions:
			break
		default:
			w.Header().Set("Allow", strings.Join(allowedHTTPMethods, ", "))
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not supported", map[string]any{
				"method": r.Method,
			})
			return
		}
		if hasUnexpectedBody(r) {
			w.Header().Set("Allow", strings.Join(allowedHTTPMethods, ", "))
			writeError(w, http.StatusBadRequest, "invalid_request", "request body is not supported for this method", map[string]any{
				"method": r.Method,
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func hasUnexpectedBody(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		// GET/HEAD/OPTIONS do not define request bodies in normal API clients.
	default:
		return false
	}

	if r.ContentLength > 0 {
		return true
	}
	if te := strings.TrimSpace(r.Header.Get("Transfer-Encoding")); te != "" {
		return true
	}
	return false
}

func hasUnsafeTokenValue(value string) bool {
	for i := 0; i < len(value); i++ {
		ch := value[i]
		if ch == '\r' || ch == '\n' || ch == '\x00' {
			return true
		}
	}
	return false
}

func shouldSkipAccessLog(r *http.Request) bool {
	return r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || r.URL.Path == "/metrics"
}

func routePattern(r *http.Request) string {
	if rctx := chi.RouteContext(r.Context()); rctx != nil {
		return rctx.RoutePattern()
	}
	return ""
}

func requestRemoteAddr(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			if host := strings.TrimSpace(parts[0]); host != "" {
				return host
			}
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	host := r.RemoteAddr
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return host
}

func (s *server) requireLocalHost(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hostFailureMsg := remoteHostFailureMessage(s.cfg.AllowRemote, len(s.cfg.AllowedHosts) > 0)
		originFailureMsg := originFailureMessage(s.cfg.AllowRemote, len(s.cfg.AllowedHosts) > 0)

		remoteHost := r.RemoteAddr
		if h, _, err := net.SplitHostPort(remoteHost); err == nil {
			remoteHost = h
		}
		ip := net.ParseIP(remoteHost)
		if ip == nil || (!ip.IsLoopback() && !(s.cfg.AllowRemote && ip.IsPrivate())) {
			msg := "remote address must be localhost"
			if s.cfg.AllowRemote {
				msg = "remote address must be localhost or private"
			}
			writeError(w, http.StatusForbidden, "forbidden", msg, map[string]any{"remoteAddr": r.RemoteAddr})
			return
		}

		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if !isAllowedHost(host, s.cfg.AllowRemote, s.cfg.AllowedHosts) {
			writeError(w, http.StatusForbidden, "forbidden", hostFailureMsg, map[string]any{"host": r.Host})
			return
		}

		if origin := r.Header.Get("Origin"); origin != "" {
			parsedOrigin, err := parseTrustedOrigin(strings.TrimSpace(origin))
			if err != nil {
				writeError(w, http.StatusForbidden, "forbidden", "invalid origin", nil)
				return
			}
			if !isAllowedHost(parsedOrigin.Hostname(), s.cfg.AllowRemote, s.cfg.AllowedHosts) {
				writeError(w, http.StatusForbidden, "forbidden", originFailureMsg, map[string]any{"origin": origin})
				return
			}
		}

		if fetchSite := strings.ToLower(r.Header.Get("Sec-Fetch-Site")); fetchSite == "cross-site" {
			// Allow cross-site requests only when a valid Origin is present and allowed.
			// Browsers include Origin for cross-site fetches; requests without Origin are rejected.
			if strings.TrimSpace(r.Header.Get("Origin")) == "" {
				writeError(w, http.StatusForbidden, "forbidden", "cross-site requests are not allowed", map[string]any{"secFetchSite": fetchSite})
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func (s *server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			if parsedOrigin, err := parseTrustedOrigin(origin); err == nil {
				if isAllowedHost(parsedOrigin.Hostname(), s.cfg.AllowRemote, s.cfg.AllowedHosts) {
					h := w.Header()
					h.Set("Access-Control-Allow-Origin", origin)
					h.Add("Vary", "Origin")
					h.Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD")
					h.Set("Access-Control-Allow-Headers", corsAllowHeaders)
					h.Set("Access-Control-Expose-Headers", corsExposeHeaders)
					h.Set("Access-Control-Max-Age", "600")
					// securityHeaders() defaults CORP to same-origin, which breaks cross-origin API calls
					// even when CORS is enabled. For allowed origins, explicitly allow cross-origin reads.
					h.Set("Cross-Origin-Resource-Policy", "cross-origin")
				}
			}
		}

		if r.Method == http.MethodOptions {
			if w.Header().Get("Access-Control-Allow-Origin") != "" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func isAllowedHost(host string, allowRemote bool, allowedHosts []string) bool {
	host = normalizeHost(host)
	if host == "" {
		return false
	}
	if hasExplicitAllowedHost(host, allowedHosts) {
		return true
	}
	if isLoopbackHost(host) {
		return true
	}
	if !allowRemote {
		return false
	}
	if len(allowedHosts) > 0 {
		return false
	}
	return isPrivateIPHost(host)
}

func hasExplicitAllowedHost(host string, allowedHosts []string) bool {
	host = normalizeHost(host)
	for _, allowed := range allowedHosts {
		if host == normalizeHost(allowed) {
			return true
		}
	}
	return false
}

func isLoopbackHost(host string) bool {
	switch normalizeHost(host) {
	case "127.0.0.1", "::1", "localhost":
		return true
	}
	ip := net.ParseIP(normalizeHost(host))
	return ip != nil && ip.IsLoopback()
}

func isPrivateIPHost(host string) bool {
	ip := net.ParseIP(normalizeHost(host))
	return ip != nil && ip.IsPrivate()
}

func remoteHostFailureMessage(allowRemote bool, hasAllowedHosts bool) string {
	if !allowRemote {
		return "host must be localhost"
	}
	if hasAllowedHosts {
		return "host must be localhost or in ALLOWED_HOSTS"
	}
	return "host must be localhost or private"
}

func originFailureMessage(allowRemote bool, hasAllowedHosts bool) string {
	if !allowRemote {
		return "origin must be localhost"
	}
	if hasAllowedHosts {
		return "origin must be localhost or in ALLOWED_HOSTS"
	}
	return "origin must be localhost or private"
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "" {
		return ""
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
	}
	host = strings.Trim(host, "[]")
	return strings.TrimSuffix(host, ".")
}

func (s *server) requireProfile(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		profileID := r.Header.Get("X-Profile-Id")
		if profileID == "" {
			writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
			return
		}

		secrets, ok, err := s.store.GetProfileSecrets(r.Context(), profileID)
		if err != nil {
			if errors.Is(err, store.ErrEncryptedCredentials) {
				writeError(w, http.StatusBadRequest, "encrypted_credentials", err.Error(), nil)
				return
			}
			if errors.Is(err, store.ErrEncryptionKeyRequired) {
				writeError(w, http.StatusBadRequest, "encryption_required", err.Error(), nil)
				return
			}
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
			return
		}
		if !ok {
			writeError(w, http.StatusBadRequest, "profile_not_found", "profile not found", map[string]any{"profileId": profileID})
			return
		}

		ctx := context.WithValue(r.Context(), profileSecretsKey, secrets)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func profileFromContext(ctx context.Context) (models.ProfileSecrets, bool) {
	v := ctx.Value(profileSecretsKey)
	secrets, ok := v.(models.ProfileSecrets)
	return secrets, ok
}

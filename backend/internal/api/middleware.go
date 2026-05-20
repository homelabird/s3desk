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

	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
	"s3desk/internal/store"
)

const corsExposeHeaders = "Retry-After, Content-Disposition, X-Log-Next-Offset, X-Upload-Skipped"
const corsAllowHeaders = "Authorization, Content-Type, X-Api-Token, X-Profile-Id, X-S3Desk-Backup-Password, X-Upload-Chunk-Index, X-Upload-Chunk-Total, X-Upload-Chunk-Size, X-Upload-File-Size, X-Upload-Relative-Path"
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
	auth := newAPITokenAuthService(s)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !auth.authorize(w, r) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authLimiterClientKey(r *http.Request) string {
	peerHost := authLimiterPeerHost(r)
	if peerHost == "" {
		return "peer:unknown"
	}
	if ip := net.ParseIP(peerHost); ip != nil && ip.IsLoopback() {
		if forwardedHost := authLimiterForwardedClientHost(r); forwardedHost != "" {
			return "loopback-proxy:" + forwardedHost
		}
		return "loopback:" + peerHost
	}
	return "peer:" + peerHost
}

func authLimiterPeerHost(r *http.Request) string {
	host := strings.TrimSpace(r.RemoteAddr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.TrimSpace(host)
}

func authLimiterForwardedClientHost(r *http.Request) string {
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
	return ""
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
		applySecurityHeaders(w, prepareSecurityHeadersRequest(r))
		next.ServeHTTP(w, r)
	})
}

func isTrustworthyOrigin(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	host := normalizeHost(r.Host)
	if isLoopbackHost(host) {
		return true
	}
	return len(host) > len(".localhost") && strings.HasSuffix(host, ".localhost")
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

		status, duration, route, path, fields := buildRequestLogResult(r, ww.Status(), ww.BytesWritten(), time.Since(start))
		observeRequestMetrics(s.metrics, r.Method, route, status, duration)
		writeRequestLog(status, path, fields)
	})
}

func (s *server) allowOnlySafeMethods(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := prepareAllowedMethodRequest(r); err != nil {
			writeRequestMethodMiddlewareError(w, err)
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
	policy := newOriginAccessMiddlewareService(s)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := policy.prepareLocalHostRequest(r); err != nil {
			writeOriginAccessMiddlewareError(w, err)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) requireLocalPeer(next http.Handler) http.Handler {
	policy := newOriginAccessMiddlewareService(s)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := policy.prepareLocalPeerRequest(r); err != nil {
			writeOriginAccessMiddlewareError(w, err)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) cors(next http.Handler) http.Handler {
	policy := newOriginAccessMiddlewareService(s)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		prepared := policy.prepareCORSRequest(r)
		applyCORSHeaders(w, prepared)
		if writeCORSPreflight(w, r, prepared) {
			return
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
		if err := profileendpoint.ValidateProfileSecretsEndpoints(secrets, s.cfg.AllowRemote); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_config", "profile endpoint is not allowed by current remote access policy", map[string]any{"error": err.Error()})
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

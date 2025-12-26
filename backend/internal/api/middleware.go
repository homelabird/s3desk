package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"object-storage/internal/logging"
	"object-storage/internal/models"
	"object-storage/internal/store"
)

func (s *server) requireAPIToken(next http.Handler) http.Handler {
	if s.cfg.APIToken == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("X-Api-Token")
		if token == "" && (isWebSocketUpgrade(r) || isSSERequest(r)) {
			token = r.URL.Query().Get("apiToken")
		}
		if token != s.cfg.APIToken {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid api token", nil)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		if h.Get("X-Frame-Options") == "" {
			h.Set("X-Frame-Options", "DENY")
		}
		if h.Get("Content-Security-Policy") == "" {
			h.Set("Content-Security-Policy", "frame-ancestors 'none'")
		}
		if h.Get("Cross-Origin-Opener-Policy") == "" && isTrustworthyOrigin(r) {
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
		}
		if h.Get("Cross-Origin-Resource-Policy") == "" {
			h.Set("Cross-Origin-Resource-Policy", "same-origin")
		}
		if h.Get("X-Content-Type-Options") == "" {
			h.Set("X-Content-Type-Options", "nosniff")
		}
		if h.Get("Referrer-Policy") == "" {
			h.Set("Referrer-Policy", "no-referrer")
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

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if shouldSkipAccessLog(r) {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}

		fields := map[string]any{
			"event":       "http.request",
			"method":      r.Method,
			"path":        r.URL.Path,
			"status":      status,
			"duration_ms": time.Since(start).Milliseconds(),
			"bytes":       ww.BytesWritten(),
			"remote_addr": requestRemoteAddr(r),
			"user_agent":  r.UserAgent(),
			"proto":       r.Proto,
		}
		if reqID := middleware.GetReqID(r.Context()); reqID != "" {
			fields["request_id"] = reqID
		}
		if route := routePattern(r); route != "" {
			fields["route"] = route
		}
		if profileID := r.Header.Get("X-Profile-Id"); profileID != "" {
			fields["profile_id"] = profileID
		}

		if status >= http.StatusInternalServerError {
			logging.ErrorFields("http request failed", fields)
			return
		}
		logging.InfoFields("http request", fields)
	})
}

func shouldSkipAccessLog(r *http.Request) bool {
	return r.URL.Path == "/healthz"
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
			msg := "host must be localhost"
			if s.cfg.AllowRemote {
				msg = "host must be localhost or private"
			}
			writeError(w, http.StatusForbidden, "forbidden", msg, map[string]any{"host": r.Host})
			return
		}

		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil {
				writeError(w, http.StatusForbidden, "forbidden", "invalid origin", nil)
				return
			}
			oh := strings.ToLower(u.Hostname())
			if !isAllowedHost(oh, s.cfg.AllowRemote, s.cfg.AllowedHosts) {
				msg := "origin must be localhost"
				if s.cfg.AllowRemote {
					msg = "origin must be localhost or private"
				}
				writeError(w, http.StatusForbidden, "forbidden", msg, map[string]any{"origin": origin})
				return
			}
		}

		if fetchSite := strings.ToLower(r.Header.Get("Sec-Fetch-Site")); fetchSite == "cross-site" {
			writeError(w, http.StatusForbidden, "forbidden", "cross-site requests are not allowed", map[string]any{"secFetchSite": fetchSite})
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
	for _, allowed := range allowedHosts {
		if host == allowed {
			return true
		}
	}
	if host == "127.0.0.1" || host == "localhost" || host == "::1" {
		return true
	}
	if !allowRemote {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsPrivate()
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "" {
		return ""
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

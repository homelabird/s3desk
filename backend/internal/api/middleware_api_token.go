package api

import (
	"net/http"
	"strings"
	"time"
)

type apiTokenAuthError struct {
	status     int
	code       string
	message    string
	details    map[string]any
	retryAfter time.Duration
}

type apiTokenAuthPreparedRequest struct {
	clientKey      string
	now            time.Time
	token          string
	realtimeTicket string
	transport      string
	tokenTooLong   bool
	err            *apiTokenAuthError
}

type apiTokenAuthService struct {
	server *server
	now    func() time.Time
}

func newAPITokenAuthService(s *server) apiTokenAuthService {
	return apiTokenAuthService{server: s, now: time.Now}
}

func (svc apiTokenAuthService) currentTime() time.Time {
	if svc.now != nil {
		return svc.now()
	}
	return time.Now()
}

func extractAPIToken(r *http.Request) string {
	token := strings.TrimSpace(r.Header.Get("X-Api-Token"))
	if token != "" {
		return token
	}
	if auth := strings.TrimSpace(r.Header.Get("Authorization")); auth != "" {
		if parts := strings.SplitN(auth, " ", 2); len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return strings.TrimSpace(parts[1])
		}
	}
	return ""
}

func realtimeRequestTransport(r *http.Request) string {
	if isWebSocketUpgrade(r) {
		return "ws"
	}
	if isSSERequest(r) {
		return "sse"
	}
	return ""
}

func isRealtimeTicketPath(r *http.Request) bool {
	switch r.URL.Path {
	case "/api/v1/events", "/api/v1/ws":
		return true
	default:
		return false
	}
}

func buildTooManyAttemptsAuthError(retryAfter time.Duration) *apiTokenAuthError {
	return &apiTokenAuthError{
		status:  http.StatusTooManyRequests,
		code:    "too_many_attempts",
		message: "too many authentication attempts",
		details: map[string]any{
			"retryAfterSeconds": int(mathCeilSeconds(retryAfter)),
		},
		retryAfter: retryAfter,
	}
}

func (svc apiTokenAuthService) invalidCredentialError(clientKey string, now time.Time, message string) *apiTokenAuthError {
	retryAfter := svc.server.authLimit.recordFailure(clientKey, now)
	return &apiTokenAuthError{
		status:     http.StatusUnauthorized,
		code:       "unauthorized",
		message:    message,
		retryAfter: retryAfter,
	}
}

func (svc apiTokenAuthService) prepareAuthorization(r *http.Request) apiTokenAuthPreparedRequest {
	prepared := apiTokenAuthPreparedRequest{
		clientKey: authLimiterClientKey(r),
		now:       svc.currentTime(),
	}

	if retryAfter, allowed := svc.server.authLimit.allow(prepared.clientKey, prepared.now); !allowed {
		prepared.err = buildTooManyAttemptsAuthError(retryAfter)
		return prepared
	}

	// Keep credentials out of URLs; query parameters are easier to leak through logs and history.
	if queryAPIToken := strings.TrimSpace(r.URL.Query().Get("apiToken")); queryAPIToken != "" {
		prepared.err = &apiTokenAuthError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "apiToken query parameter is not supported; use X-Api-Token or Authorization: Bearer",
		}
		return prepared
	}

	prepared.token = extractAPIToken(r)
	if prepared.token != "" {
		if hasUnsafeTokenValue(prepared.token) {
			prepared.err = &apiTokenAuthError{status: http.StatusUnauthorized, code: "unauthorized", message: "invalid api token"}
			return prepared
		}
		prepared.tokenTooLong = len(prepared.token) > maxAPITokenBytes
		return prepared
	}

	// Only realtime endpoints may consume one-shot transport tickets.
	prepared.transport = realtimeRequestTransport(r)
	if prepared.transport != "" && isRealtimeTicketPath(r) {
		prepared.realtimeTicket = strings.TrimSpace(r.URL.Query().Get("realtimeTicket"))
	}

	return prepared
}

func (svc apiTokenAuthService) executePrepared(w http.ResponseWriter, r *http.Request, prepared apiTokenAuthPreparedRequest) (bool, bool, *apiTokenAuthError) {
	if prepared.err != nil {
		return false, false, prepared.err
	}

	if prepared.realtimeTicket != "" {
		if svc.server.rejectInvalidRealtimeOrigin(w, r, "realtime requests require a trusted Origin") {
			return false, true, nil
		}
		if svc.server.realtimeTickets != nil && svc.server.realtimeTickets.Consume(prepared.realtimeTicket, prepared.transport, prepared.now) {
			svc.server.authLimit.reset(prepared.clientKey)
			return true, false, nil
		}
		return false, false, svc.invalidCredentialError(prepared.clientKey, prepared.now, "invalid realtime ticket")
	}

	if prepared.tokenTooLong {
		return false, false, svc.invalidCredentialError(prepared.clientKey, prepared.now, "invalid api token")
	}
	if apiTokenEqual(prepared.token, svc.server.cfg.APIToken) {
		svc.server.authLimit.reset(prepared.clientKey)
		return true, false, nil
	}
	return false, false, svc.invalidCredentialError(prepared.clientKey, prepared.now, "invalid api token")
}

func writeAPITokenAuthError(w http.ResponseWriter, err *apiTokenAuthError) {
	if err == nil {
		return
	}
	if err.retryAfter > 0 {
		w.Header().Set("Retry-After", formatRetryAfterSeconds(err.retryAfter))
	}
	writeError(w, err.status, err.code, err.message, err.details)
}

func (svc apiTokenAuthService) authorize(w http.ResponseWriter, r *http.Request) bool {
	authorized, skipWrite, err := svc.executePrepared(w, r, svc.prepareAuthorization(r))
	if authorized {
		return true
	}
	if skipWrite {
		return false
	}
	writeAPITokenAuthError(w, err)
	return false
}

package api

import (
	"net/http"
	"strings"
)

type securityHeadersPreparedRequest struct {
	trustworthyOrigin bool
	secureTransport   bool
}

type requestMethodMiddlewareError struct {
	status      int
	code        string
	message     string
	details     map[string]any
	allowHeader string
}

func prepareSecurityHeadersRequest(r *http.Request) securityHeadersPreparedRequest {
	return securityHeadersPreparedRequest{
		trustworthyOrigin: isTrustworthyOrigin(r),
		secureTransport:   r.TLS != nil,
	}
}

func applySecurityHeaders(w http.ResponseWriter, prepared securityHeadersPreparedRequest) {
	h := w.Header()
	if h.Get("X-Frame-Options") == "" {
		h.Set("X-Frame-Options", "DENY")
	}
	if h.Get("Content-Security-Policy") == "" {
		h.Set("Content-Security-Policy", defaultContentSecurityPolicy)
	}
	if h.Get("Cross-Origin-Opener-Policy") == "" && prepared.trustworthyOrigin {
		// Keep popup/Window targeting isolated for trusted local/UI requests.
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
	}
	if h.Get("Cross-Origin-Resource-Policy") == "" {
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
	}
	if h.Get("Origin-Agent-Cluster") == "" && prepared.trustworthyOrigin {
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
	if h.Get("Strict-Transport-Security") == "" && prepared.secureTransport {
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
	}
}

func prepareAllowedMethodRequest(r *http.Request) *requestMethodMiddlewareError {
	allowHeader := strings.Join(allowedHTTPMethods, ", ")
	switch strings.ToUpper(r.Method) {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions:
	default:
		return &requestMethodMiddlewareError{
			status:      http.StatusMethodNotAllowed,
			code:        "method_not_allowed",
			message:     "method not supported",
			details:     map[string]any{"method": r.Method},
			allowHeader: allowHeader,
		}
	}

	if hasUnexpectedBody(r) {
		return &requestMethodMiddlewareError{
			status:      http.StatusBadRequest,
			code:        "invalid_request",
			message:     "request body is not supported for this method",
			details:     map[string]any{"method": r.Method},
			allowHeader: allowHeader,
		}
	}

	return nil
}

func writeRequestMethodMiddlewareError(w http.ResponseWriter, err *requestMethodMiddlewareError) {
	if err == nil {
		return
	}
	if err.allowHeader != "" {
		w.Header().Set("Allow", err.allowHeader)
	}
	writeError(w, err.status, err.code, err.message, err.details)
}

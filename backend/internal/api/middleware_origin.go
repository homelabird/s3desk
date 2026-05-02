package api

import (
	"net"
	"net/http"
	"strings"
)

type originAccessMiddlewareError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type corsPreparedRequest struct {
	allowedOrigin string
}

type originAccessMiddlewareService struct {
	server *server
}

func newOriginAccessMiddlewareService(s *server) originAccessMiddlewareService {
	return originAccessMiddlewareService{server: s}
}

func writeOriginAccessMiddlewareError(w http.ResponseWriter, err *originAccessMiddlewareError) {
	if err == nil {
		return
	}
	writeError(w, err.status, err.code, err.message, err.details)
}

func (svc originAccessMiddlewareService) prepareLocalPeerRequest(r *http.Request) *originAccessMiddlewareError {
	remoteHost := strings.TrimSpace(r.RemoteAddr)
	if h, _, err := net.SplitHostPort(remoteHost); err == nil {
		remoteHost = h
	}
	ip := net.ParseIP(remoteHost)
	if ip == nil || (!ip.IsLoopback() && !(svc.server.cfg.AllowRemote && ip.IsPrivate())) {
		msg := "remote address must be localhost"
		if svc.server.cfg.AllowRemote {
			msg = "remote address must be localhost or private"
		}
		return &originAccessMiddlewareError{
			status:  http.StatusForbidden,
			code:    "forbidden",
			message: msg,
			details: map[string]any{"remoteAddr": r.RemoteAddr},
		}
	}

	return nil
}

func (svc originAccessMiddlewareService) prepareLocalHostRequest(r *http.Request) *originAccessMiddlewareError {
	hostFailureMsg := remoteHostFailureMessage(svc.server.cfg.AllowRemote, len(svc.server.cfg.AllowedHosts) > 0)
	originFailureMsg := originFailureMessage(svc.server.cfg.AllowRemote, len(svc.server.cfg.AllowedHosts) > 0)

	if err := svc.prepareLocalPeerRequest(r); err != nil {
		return err
	}

	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	if !isAllowedHost(host, svc.server.cfg.AllowRemote, svc.server.cfg.AllowedHosts) {
		return &originAccessMiddlewareError{
			status:  http.StatusForbidden,
			code:    "forbidden",
			message: hostFailureMsg,
			details: map[string]any{"host": r.Host},
		}
	}

	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin != "" {
		parsedOrigin, err := parseTrustedOrigin(origin)
		if err != nil {
			return &originAccessMiddlewareError{status: http.StatusForbidden, code: "forbidden", message: "invalid origin"}
		}
		if !isAllowedHost(parsedOrigin.Hostname(), svc.server.cfg.AllowRemote, svc.server.cfg.AllowedHosts) {
			return &originAccessMiddlewareError{
				status:  http.StatusForbidden,
				code:    "forbidden",
				message: originFailureMsg,
				details: map[string]any{"origin": origin},
			}
		}
	}

	if fetchSite := strings.ToLower(strings.TrimSpace(r.Header.Get("Sec-Fetch-Site"))); fetchSite == "cross-site" && origin == "" {
		return &originAccessMiddlewareError{
			status:  http.StatusForbidden,
			code:    "forbidden",
			message: "cross-site requests are not allowed",
			details: map[string]any{"secFetchSite": fetchSite},
		}
	}

	return nil
}

func (svc originAccessMiddlewareService) prepareCORSRequest(r *http.Request) corsPreparedRequest {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return corsPreparedRequest{}
	}
	parsedOrigin, err := parseTrustedOrigin(origin)
	if err != nil {
		return corsPreparedRequest{}
	}
	if !isAllowedHost(parsedOrigin.Hostname(), svc.server.cfg.AllowRemote, svc.server.cfg.AllowedHosts) {
		return corsPreparedRequest{}
	}
	return corsPreparedRequest{allowedOrigin: origin}
}

func applyCORSHeaders(w http.ResponseWriter, prepared corsPreparedRequest) {
	if prepared.allowedOrigin == "" {
		return
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", prepared.allowedOrigin)
	h.Add("Vary", "Origin")
	h.Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD")
	h.Set("Access-Control-Allow-Headers", corsAllowHeaders)
	h.Set("Access-Control-Expose-Headers", corsExposeHeaders)
	h.Set("Access-Control-Max-Age", "600")
	// securityHeaders() defaults CORP to same-origin, which breaks cross-origin API calls
	// even when CORS is enabled. For allowed origins, explicitly allow cross-origin reads.
	h.Set("Cross-Origin-Resource-Policy", "cross-origin")
}

func writeCORSPreflight(w http.ResponseWriter, r *http.Request, prepared corsPreparedRequest) bool {
	if r.Method == http.MethodOptions && prepared.allowedOrigin != "" {
		w.WriteHeader(http.StatusNoContent)
		return true
	}
	return false
}

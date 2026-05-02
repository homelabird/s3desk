package api

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func parseTrustedOrigin(originHeader string) (*url.URL, error) {
	originHeader = strings.TrimSpace(originHeader)
	if originHeader == "" {
		return nil, errors.New("empty origin")
	}
	if strings.EqualFold(originHeader, "null") {
		return nil, errors.New("null origin is not allowed")
	}
	parsed, err := url.Parse(originHeader)
	if err != nil {
		return nil, err
	}
	switch strings.ToLower(strings.TrimSpace(parsed.Scheme)) {
	case "http", "https":
	default:
		return nil, errors.New("unsupported origin scheme")
	}
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return nil, errors.New("origin has empty host")
	}
	if port := strings.TrimSpace(parsed.Port()); port != "" {
		portNum, err := strconv.Atoi(port)
		if err != nil || portNum < 1 || portNum > 65535 {
			return nil, errors.New("origin has invalid port")
		}
	}
	if parsed.User != nil {
		return nil, errors.New("origin must not include userinfo")
	}
	if parsed.Opaque != "" {
		return nil, errors.New("origin must not be opaque")
	}
	if parsed.Path != "" {
		return nil, errors.New("origin must not include path")
	}
	if parsed.RawQuery != "" {
		return nil, errors.New("origin must not include query")
	}
	if parsed.Fragment != "" {
		return nil, errors.New("origin must not include fragment")
	}
	return parsed, nil
}

func (s *server) isAllowedRealtimeOrigin(originHeader string) bool {
	parsed, err := parseTrustedOrigin(originHeader)
	if err != nil {
		return false
	}
	return isAllowedHost(parsed.Hostname(), s.cfg.AllowRemote, s.cfg.AllowedHosts)
}

func (s *server) rejectInvalidRealtimeOrigin(w http.ResponseWriter, r *http.Request, message string) bool {
	if s.isAllowedRealtimeOrigin(r.Header.Get("Origin")) {
		return false
	}
	writeError(w, http.StatusForbidden, "forbidden", message, map[string]any{
		"origin": strings.TrimSpace(r.Header.Get("Origin")),
	})
	return true
}

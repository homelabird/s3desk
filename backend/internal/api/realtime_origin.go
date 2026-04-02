package api

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
)

func parseTrustedOrigin(originHeader string) (*url.URL, error) {
	originHeader = strings.TrimSpace(originHeader)
	if originHeader == "" {
		return nil, errors.New("empty origin")
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

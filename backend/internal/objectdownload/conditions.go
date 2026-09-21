package objectdownload

import (
	"net/http"
	"strings"
	"time"
)

// entityTagMatch parses a list without splitting commas inside quoted opaque
// tags. If-Match is strong; If-None-Match is weak (RFC 9110, sections 13.1/13.2).
// Malformed If-Match fails closed. Metadata is already known to exist here.
func entityTagMatch(value, current string, weak bool) bool {
	value = strings.TrimSpace(value)
	if value == "*" {
		return true
	}
	currentWeak := strings.HasPrefix(current, "W/")
	current = strings.TrimPrefix(current, "W/")
	if !StrongETag(current) || (!weak && currentWeak) {
		return false
	}
	matched := false
	for value != "" {
		value = strings.TrimLeft(value, " \t,")
		if value == "" {
			break
		}
		tagWeak := strings.HasPrefix(value, "W/")
		value = strings.TrimPrefix(value, "W/")
		if !strings.HasPrefix(value, `"`) {
			return false
		}
		end := strings.IndexByte(value[1:], '"')
		if end < 0 {
			return false
		}
		tag := value[:end+2]
		if !StrongETag(tag) {
			return false
		}
		if tag == current && (weak || !tagWeak) {
			matched = true
		}
		value = strings.TrimLeft(value[end+2:], " \t")
		if value != "" && value[0] != ',' {
			return false
		}
	}
	return matched
}

func preconditionStatus(r *http.Request, m Metadata) int {
	if values := r.Header.Values("If-Match"); len(values) != 0 {
		if !entityTagMatch(strings.Join(values, ","), m.ETag, false) {
			return http.StatusPreconditionFailed
		}
	} else if raw := r.Header.Get("If-Unmodified-Since"); raw != "" && !m.LastModified.IsZero() {
		if date, err := http.ParseTime(raw); err == nil && m.LastModified.Truncate(time.Second).After(date) {
			return http.StatusPreconditionFailed
		}
	}
	if values := r.Header.Values("If-None-Match"); len(values) != 0 {
		if entityTagMatch(strings.Join(values, ","), m.ETag, true) {
			return http.StatusNotModified
		}
	} else if raw := r.Header.Get("If-Modified-Since"); raw != "" && !m.LastModified.IsZero() {
		if date, err := http.ParseTime(raw); err == nil && !m.LastModified.Truncate(time.Second).After(date) {
			return http.StatusNotModified
		}
	}
	return http.StatusOK
}

func checkPreconditions(w http.ResponseWriter, r *http.Request, m Metadata, key string) bool {
	status := preconditionStatus(r, m)
	switch status {
	case http.StatusNotModified:
		headers(w.Header(), m, key)
		// Do not declare an error-body length or a ranged length for 304.
		w.Header().Del("Content-Length")
		w.Header().Del("Content-Type")
		w.Header().Del("Content-Disposition")
		w.Header().Del("Content-Range")
		w.WriteHeader(status)
		return false
	case http.StatusPreconditionFailed:
		fail(w, &HTTPError{Status: status})
		return false
	default:
		return true
	}
}

// Package objectdownload serves immutable/conditionally-read object responses.
// It never treats client-supplied size hints as HTTP representation metadata.
package objectdownload

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

type Metadata struct {
	Size         int64
	ETag         string
	VersionID    string
	ContentType  string
	LastModified time.Time
}
type ReadRequest struct{ Range, IfMatch, VersionID string }
type Response struct {
	Metadata
	Body         io.ReadCloser
	ContentRange string
}
type Source interface {
	Head(context.Context) (Metadata, error)
	Get(context.Context, ReadRequest) (Response, error)
}
type HTTPError struct{ Status int }

func (e *HTTPError) Error() string { return http.StatusText(e.Status) }

// SingleRange ignores unsupported units and multiple ranges. Invalid or
// unsatisfiable single byte ranges return an error (416). Arithmetic is int64.
func SingleRange(raw string, size int64) (start, length int64, use bool, err error) {
	if raw == "" || !strings.HasPrefix(raw, "bytes=") || strings.Contains(raw, ",") {
		return
	}
	if size < 0 {
		return 0, 0, false, nil
	}
	spec := strings.TrimSpace(strings.TrimPrefix(raw, "bytes="))
	a, b, ok := strings.Cut(spec, "-")
	bad := func() (int64, int64, bool, error) { return 0, 0, false, errors.New("invalid byte range") }
	if !ok || size == 0 {
		return bad()
	}
	// ParseUint rejects signs; byte positions do not allow + or negative values.
	parse := func(s string) (int64, error) { n, e := strconv.ParseUint(s, 10, 63); return int64(n), e }
	if a == "" {
		count, e := parse(b)
		if e != nil || count <= 0 {
			return bad()
		}
		if count > size {
			count = size
		}
		return size - count, count, true, nil
	}
	start, e := parse(a)
	if e != nil || start >= size {
		return bad()
	}
	end := size - 1
	if b != "" {
		end, e = parse(b)
		if e != nil || end < start {
			return bad()
		}
		if end >= size {
			end = size - 1
		}
	}
	return start, end - start + 1, true, nil
}

func StrongETag(tag string) bool {
	if len(tag) < 2 || tag[0] != '"' || tag[len(tag)-1] != '"' {
		return false
	}
	for i := 1; i < len(tag)-1; i++ {
		if tag[i] == '"' || tag[i] < 0x21 || tag[i] == 0x7f {
			return false
		}
	}
	return true
}
func headers(h http.Header, m Metadata, key string) {
	ct := m.ContentType
	if strings.TrimSpace(ct) == "" {
		ct = "application/octet-stream"
	}
	h.Set("Content-Type", ct)
	h.Set("Cache-Control", "private, no-store, no-transform")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Content-Type-Options", "nosniff")
	if m.Size >= 0 {
		h.Set("Content-Length", strconv.FormatInt(m.Size, 10))
	}
	if StrongETag(strings.TrimPrefix(m.ETag, "W/")) {
		h.Set("ETag", m.ETag)
	}
	if StrongETag(m.ETag) && m.Size >= 0 {
		h.Set("Accept-Ranges", "bytes")
	} else {
		h.Set("Accept-Ranges", "none")
	}
	if !m.LastModified.IsZero() {
		h.Set("Last-Modified", m.LastModified.UTC().Format(http.TimeFormat))
	}
	if name := path.Base(key); name != "" && name != "." && name != "/" {
		h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
	}
}
func fail(w http.ResponseWriter, err error) {
	status := http.StatusBadGateway
	var he *HTTPError
	if errors.As(err, &he) && he.Status >= 400 && he.Status <= 599 {
		status = he.Status
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	code := "download_failed"
	switch status {
	case http.StatusNotFound:
		code = "not_found"
	case http.StatusForbidden:
		code = "access_denied"
	case http.StatusPreconditionFailed:
		code = "object_changed"
	case http.StatusRequestedRangeNotSatisfiable:
		code = "invalid_range"
	case http.StatusTooManyRequests:
		code = "rate_limited"
		w.Header().Set("Retry-After", "2")
	}
	w.WriteHeader(status)
	// ErrorResponse-compatible shape without provider diagnostics or signed URLs.
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": code, "message": http.StatusText(status)}})
}

// Serve only advertises byte ranges when an object has a strong validator.
// A ranged read is tied to HEAD via If-Match (and version ID where available),
// and its GET headers are verified before any response headers are committed.
func Serve(w http.ResponseWriter, r *http.Request, src Source, key string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if r.Method == http.MethodHead {
		m, err := src.Head(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		if !checkPreconditions(w, r, m, key) {
			return
		}
		headers(w.Header(), m, key)
		w.WriteHeader(http.StatusOK)
		return
	}
	rr := ReadRequest{}
	// Only send a single supported condition upstream; entity-tag lists are
	// evaluated locally against the actual response, not rejected as one tag.
	if tag := r.Header.Get("If-Match"); len(r.Header.Values("If-Match")) == 1 && (StrongETag(tag) || tag == "*") {
		rr.IfMatch = tag
	}
	var expected *Metadata
	var start, length int64
	rawRange := r.Header.Get("Range")
	if rawRange != "" {
		m, err := src.Head(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		if !checkPreconditions(w, r, m, key) {
			return
		}
		ir := r.Header.Get("If-Range")
		// Dates are not treated as strong validators; full restart is safer.
		if StrongETag(m.ETag) && (ir == "" || StrongETag(ir) && ir == m.ETag) {
			var use bool
			start, length, use, err = SingleRange(rawRange, m.Size)
			if err != nil {
				w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", m.Size))
				fail(w, &HTTPError{Status: http.StatusRequestedRangeNotSatisfiable})
				return
			}
			if use {
				rr.Range = fmt.Sprintf("bytes=%d-%d", start, start+length-1)
				rr.IfMatch = m.ETag
				if m.VersionID != "null" {
					rr.VersionID = m.VersionID
				}
				expected = &m
			}
		}
	}
	response, err := src.Get(r.Context(), rr)
	if err != nil {
		fail(w, err)
		return
	}
	if response.Body == nil {
		fail(w, errors.New("missing body"))
		return
	}
	defer response.Body.Close()
	status := http.StatusOK
	if expected != nil {
		cr := fmt.Sprintf("bytes %d-%d/%d", start, start+length-1, expected.Size)
		if response.ContentRange != cr || response.Size != length || response.ETag != expected.ETag || (rr.VersionID != "" && response.VersionID != rr.VersionID) {
			fail(w, errors.New("inconsistent ranged response"))
			return
		}
		status = http.StatusPartialContent
		w.Header().Set("Content-Range", cr)
	} else if response.ContentRange != "" {
		fail(w, errors.New("unsolicited partial response"))
		return
	}
	if !checkPreconditions(w, r, response.Metadata, key) {
		return
	}
	headers(w.Header(), response.Metadata, key)
	w.WriteHeader(status)
	n, copyErr := io.CopyBuffer(w, response.Body, make([]byte, 64*1024))
	if copyErr != nil || response.Size >= 0 && n != response.Size {
		// A short/failed stream must never look like a clean successful response.
		// net/http closes HTTP/1 connections / resets HTTP/2 streams for this panic.
		panic(http.ErrAbortHandler)
	}
}

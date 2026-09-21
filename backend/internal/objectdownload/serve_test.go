package objectdownload

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

type memorySource struct {
	data                string
	etag                string
	getRequest          ReadRequest
	heads, gets, closes int
	mutate              bool
	wrongRange          bool
	short               bool
}

func (s *memorySource) Head(context.Context) (Metadata, error) {
	s.heads++
	return Metadata{Size: int64(len(s.data)), ETag: s.etag, ContentType: "text/plain"}, nil
}

type countedReader struct {
	io.Reader
	close func()
}

func (r countedReader) Close() error { r.close(); return nil }
func (s *memorySource) Get(_ context.Context, q ReadRequest) (Response, error) {
	s.gets++
	s.getRequest = q
	if s.mutate {
		s.etag = `"changed"`
		s.data = "different version"
	}
	if q.IfMatch != "" && q.IfMatch != "*" && q.IfMatch != s.etag {
		return Response{}, &HTTPError{Status: 412}
	}
	data := s.data
	cr := ""
	if q.Range != "" && !s.wrongRange {
		start, n, use, e := SingleRange(q.Range, int64(len(data)))
		if e != nil || !use {
			return Response{}, errors.New("bad test range")
		}
		cr = "bytes " + strconv.FormatInt(start, 10) + "-" + strconv.FormatInt(start+n-1, 10) + "/" + strconv.Itoa(len(data))
		data = data[start : start+n]
	}
	size := int64(len(data))
	if s.short {
		size++
	}
	return Response{Metadata: Metadata{Size: size, ETag: s.etag, ContentType: "text/plain"}, ContentRange: cr, Body: countedReader{Reader: strings.NewReader(data), close: func() { s.closes++ }}}, nil
}
func TestSingleRange(t *testing.T) {
	cases := []struct {
		raw            string
		size, start, n int64
		use, bad       bool
	}{
		{"bytes=4-7", 8, 4, 4, true, false}, {"bytes=4-", 8, 4, 4, true, false}, {"bytes=-3", 8, 5, 3, true, false},
		{"bytes=-100", 8, 0, 8, true, false}, {"bytes=0-100", 8, 0, 8, true, false}, {"bytes=0-0", 8, 0, 1, true, false},
		{"bytes=8-9", 8, 0, 0, false, true}, {"bytes=4-3", 8, 0, 0, false, true}, {"bytes=-0", 8, 0, 0, false, true},
		{"bytes=0-", 0, 0, 0, false, true}, {"bytes=9223372036854775808-", 8, 0, 0, false, true},
		{"bytes=+1-3", 8, 0, 0, false, true}, {"bytes=abc-def", 8, 0, 0, false, true},
		{"bytes=0-1,4-5", 8, 0, 0, false, false}, {"items=0-1", 8, 0, 0, false, false}, {"", 8, 0, 0, false, false},
	}
	for _, tt := range cases {
		t.Run(tt.raw, func(t *testing.T) {
			a, n, u, e := SingleRange(tt.raw, tt.size)
			if a != tt.start || n != tt.n || u != tt.use || (e != nil) != tt.bad {
				t.Fatalf("got (%d %d %v %v)", a, n, u, e)
			}
		})
	}
}
func TestServeRangesAndVersions(t *testing.T) {
	cases := []struct {
		name, method, rangeHeader, ifRange string
		mutate, wrong                      bool
		status                             int
		body, cr                           string
	}{
		{name: "fresh body", method: "GET", status: 200, body: "01234567"},
		{name: "zero-based range", method: "GET", rangeHeader: "bytes=4-7", status: 206, body: "4567", cr: "bytes 4-7/8"},
		{name: "suffix", method: "GET", rangeHeader: "bytes=-2", status: 206, body: "67", cr: "bytes 6-7/8"},
		{name: "head", method: "HEAD", status: 200},
		{name: "head ignores range", method: "HEAD", rangeHeader: "bytes=4-7", status: 200},
		{name: "bad range", method: "GET", rangeHeader: "bytes=10-", status: 416, cr: "bytes */8"},
		{name: "IfRange matches", method: "GET", rangeHeader: "bytes=4-", ifRange: `"v1"`, status: 206, body: "4567", cr: "bytes 4-7/8"},
		{name: "IfRange changed full restart", method: "GET", rangeHeader: "bytes=4-", ifRange: `"old"`, status: 200, body: "01234567"},
		{name: "weak IfRange full restart", method: "GET", rangeHeader: "bytes=4-", ifRange: `W/"v1"`, status: 200, body: "01234567"},
		{name: "date IfRange full restart", method: "GET", rangeHeader: "bytes=4-", ifRange: "Wed, 21 Oct 2015 07:28:00 GMT", status: 200, body: "01234567"},
		{name: "HEAD GET race rejected", method: "GET", rangeHeader: "bytes=4-", mutate: true, status: 412},
		{name: "upstream ignoring range rejected", method: "GET", rangeHeader: "bytes=4-", wrong: true, status: 502},
		{name: "multi range ignored", method: "GET", rangeHeader: "bytes=0-1,4-5", status: 200, body: "01234567"},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			s := &memorySource{data: "01234567", etag: `"v1"`, mutate: tt.mutate, wrongRange: tt.wrong}
			r := httptest.NewRequest(tt.method, "/download?size=999999", nil)
			r.Header.Set("Range", tt.rangeHeader)
			r.Header.Set("If-Range", tt.ifRange)
			w := httptest.NewRecorder()
			Serve(w, r, s, "a.txt")
			if w.Code != tt.status {
				t.Fatalf("code %d body %s", w.Code, w.Body.String())
			}
			if tt.status < 300 && w.Body.String() != tt.body {
				t.Fatalf("body %q", w.Body.String())
			}
			if w.Header().Get("Content-Range") != tt.cr {
				t.Fatalf("range %q", w.Header().Get("Content-Range"))
			}
			if tt.method == "HEAD" && s.gets != 0 {
				t.Fatal("HEAD read body")
			}
			if tt.status < 300 && tt.method == "GET" && s.closes != 1 {
				t.Fatal("body not closed")
			}
		})
	}
}
func TestServeAuthoritativeSize(t *testing.T) {
	for _, hint := range []string{"4", "12", "8", ""} {
		t.Run(hint, func(t *testing.T) {
			s := &memorySource{data: "01234567", etag: `"v2"`}
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { Serve(w, r, s, "file.bin") }))
			defer srv.Close()
			res, e := http.Get(srv.URL + "?size=" + hint)
			if e != nil {
				t.Fatal(e)
			}
			defer res.Body.Close()
			data, e := io.ReadAll(res.Body)
			if e != nil || string(data) != "01234567" || res.ContentLength != 8 {
				t.Fatalf("data %q length %d err %v", data, res.ContentLength, e)
			}
			if s.heads != 0 {
				t.Fatal("unnecessary preflight for full GET")
			}
		})
	}
}
func TestServeUnknownValidatorDoesNotResume(t *testing.T) {
	s := &memorySource{data: "01234567"}
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Range", "bytes=4-")
	w := httptest.NewRecorder()
	Serve(w, r, s, "x")
	if w.Code != 200 || w.Body.String() != s.data || w.Header().Get("Accept-Ranges") != "none" {
		t.Fatal(w.Result())
	}
}
func TestServeShortBodyAborts(t *testing.T) {
	s := &memorySource{data: "data", etag: `"v1"`, short: true}
	defer func() {
		if recover() != http.ErrAbortHandler {
			t.Fatal("short response looked successful")
		}
		if s.closes != 1 {
			t.Fatal("body not closed")
		}
	}()
	Serve(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil), s, "x")
}
func TestServeEmptyObject(t *testing.T) {
	s := &memorySource{etag: `"empty"`}
	w := httptest.NewRecorder()
	Serve(w, httptest.NewRequest("GET", "/", nil), s, "x")
	if w.Code != 200 || w.Header().Get("Content-Length") != "0" {
		t.Fatal(w.Result())
	}
}

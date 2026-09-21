package objectdownload

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestEntityTagLists(t *testing.T) {
	cases := []struct {
		name, value, current string
		weak, want           bool
	}{
		{"one", `"v1"`, `"v1"`, false, true},
		{"alternative", `"old", "v1"`, `"v1"`, false, true},
		{"comma within tag", `"old", "part,one"`, `"part,one"`, false, true},
		{"star exists", `*`, "", false, true},
		{"strong rejects weak", `W/"v1"`, `"v1"`, false, false},
		{"weak comparison", `W/"v1"`, `"v1"`, true, true},
		{"weak current", `"v1"`, `W/"v1"`, true, true},
		{"strong current weak", `"v1"`, `W/"v1"`, false, false},
		{"empty opaque tag", `""`, `""`, false, true},
		{"no match", `"old", "older"`, `"v1"`, false, false},
		{"list whitespace", " , \t\"v1\", ", `"v1"`, false, true},
		{"wildcard mixed with list invalid", `*, "v1"`, `"v1"`, true, false},
		{"bare tag invalid", `v1`, `"v1"`, false, false},
		{"missing delimiter invalid", `"v1" "v2"`, `"v1"`, false, false},
		{"trailing garbage invalid", `"v1", missing`, `"v1"`, false, false},
		{"control invalid", "\"a\x00\"", `"v1"`, true, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := entityTagMatch(c.value, c.current, c.weak); got != c.want {
				t.Fatalf("got %v want %v", got, c.want)
			}
		})
	}
}

func TestConditionalPrecedence(t *testing.T) {
	modified := time.Date(2026, 1, 2, 3, 4, 5, 900000000, time.UTC)
	old := modified.Add(-time.Hour).Format(http.TimeFormat)
	future := modified.Add(time.Hour).Format(http.TimeFormat)
	cases := []struct {
		name   string
		header map[string]string
		status int
	}{
		{"unconditional", nil, 200},
		{"match list", map[string]string{"If-Match": `"old", "v1"`}, 200},
		{"match failure", map[string]string{"If-Match": `"old"`}, 412},
		{"match before none", map[string]string{"If-Match": `"old"`, "If-None-Match": `"v1"`}, 412},
		{"match overrides unmodified", map[string]string{"If-Match": `"v1"`, "If-Unmodified-Since": old}, 200},
		{"unmodified failed", map[string]string{"If-Unmodified-Since": old}, 412},
		{"unmodified passes", map[string]string{"If-Unmodified-Since": future}, 200},
		{"none list", map[string]string{"If-None-Match": `"old", W/"v1"`}, 304},
		{"none wildcard", map[string]string{"If-None-Match": `*`}, 304},
		{"none overrides modified", map[string]string{"If-None-Match": `"old"`, "If-Modified-Since": future}, 200},
		{"modified same second", map[string]string{"If-Modified-Since": modified.Format(http.TimeFormat)}, 304},
		{"modified later", map[string]string{"If-Modified-Since": old}, 200},
		{"invalid date ignored", map[string]string{"If-Modified-Since": "not-a-date"}, 200},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			for k, v := range c.header {
				r.Header.Set(k, v)
			}
			if got := preconditionStatus(r, Metadata{ETag: `"v1"`, LastModified: modified}); got != c.status {
				t.Fatalf("got %d want %d", got, c.status)
			}
		})
	}
}

// Deliberately ignores upstream If-Match so the local response verification is
// exercised too (some S3-compatible providers incompletely implement conditions).
type conditionSource struct {
	metadata            Metadata
	heads, gets, closes int
	request             ReadRequest
}

func (s *conditionSource) Head(context.Context) (Metadata, error) { s.heads++; return s.metadata, nil }
func (s *conditionSource) Get(_ context.Context, request ReadRequest) (Response, error) {
	s.gets++
	s.request = request
	return Response{Metadata: s.metadata, Body: countedReader{Reader: strings.NewReader("DATA"), close: func() { s.closes++ }}}, nil
}

func TestServeConditionalRequests(t *testing.T) {
	for _, method := range []string{"GET", "HEAD"} {
		for _, name := range []string{"none-match", "match-failed", "match-list", "repeated-match-header"} {
			t.Run(method+"/"+name, func(t *testing.T) {
				src := &conditionSource{metadata: Metadata{Size: 4, ETag: `"v1"`}}
				r := httptest.NewRequest(method, "/", nil)
				want := 200
				switch name {
				case "none-match":
					r.Header.Set("If-None-Match", `W/"v1"`)
					want = 304
				case "match-failed":
					r.Header.Set("If-Match", `"old"`)
					want = 412
				case "match-list":
					r.Header.Set("If-Match", `"old", "v1"`)
				case "repeated-match-header":
					r.Header.Add("If-Match", `"old"`)
					r.Header.Add("If-Match", `"v1"`)
				}
				w := httptest.NewRecorder()
				Serve(w, r, src, "file.bin")
				if w.Code != want {
					t.Fatalf("status %d body %s", w.Code, w.Body.String())
				}
				if want == 304 && (w.Body.Len() != 0 || w.Header().Get("Content-Length") != "" || w.Header().Get("ETag") != `"v1"`) {
					t.Fatal("invalid 304 headers/body")
				}
				if method == "GET" && src.closes != 1 {
					t.Fatal("unconsumed body not closed")
				}
				if method == "HEAD" && src.gets != 0 {
					t.Fatal("HEAD should never read body")
				}
				if name == "repeated-match-header" && src.request.IfMatch != "" {
					t.Fatal("forwarded only first list alternative")
				}
			})
		}
	}
}

func TestConditionalChecksBeforeRange(t *testing.T) {
	for _, c := range []struct {
		header string
		value  string
		want   int
	}{
		{"If-None-Match", `"v1"`, 304}, {"If-Match", `"old"`, 412},
	} {
		t.Run(c.header, func(t *testing.T) {
			s := &memorySource{data: "01234567", etag: `"v1"`}
			r := httptest.NewRequest("GET", "/", nil)
			r.Header.Set("Range", "bytes=999-")
			r.Header.Set(c.header, c.value)
			w := httptest.NewRecorder()
			Serve(w, r, s, "file")
			if w.Code != c.want || s.gets != 0 {
				t.Fatalf("code %d GETs %d", w.Code, s.gets)
			}
		})
	}
	s := &memorySource{data: "01234567", etag: `"v1"`}
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Range", "bytes=4-")
	r.Header.Set("If-Match", `"old", "v1"`)
	w := httptest.NewRecorder()
	Serve(w, r, s, "file")
	if w.Code != 206 || w.Body.String() != "4567" || s.getRequest.IfMatch != `"v1"` {
		t.Fatal("valid list did not yield pinned range")
	}
}

func TestConditional304RealHTTP(t *testing.T) {
	src := &conditionSource{metadata: Metadata{Size: 4, ETag: `"v1"`}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { Serve(w, r, src, "file.bin") }))
	defer server.Close()
	req, _ := http.NewRequest("GET", server.URL, nil)
	req.Header.Set("If-None-Match", `"v1"`)
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil || len(body) != 0 || res.StatusCode != 304 {
		t.Fatalf("status %d body %q err %v", res.StatusCode, body, err)
	}
}

package operationreceipt

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const testKey = "0123456789abcdef0123456789abcdef"

func request(body, key, scope string) *http.Request {
	r := httptest.NewRequest("POST", "/jobs", strings.NewReader(body))
	r.Header.Set(Header, key)
	r.Header.Set("X-Profile-Id", scope)
	r.Header.Set("Content-Type", "application/json")
	return r
}
func wrapped(s *Store, fn http.HandlerFunc) http.Handler {
	return s.Wrap(func(r *http.Request) string { return "token:" + r.Header.Get("X-Profile-Id") }, fn)
}
func response(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func TestReplayAcrossAddressesAndRestart(t *testing.T) {
	dir := t.TempDir()
	calls := 0
	fn := func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(201)
		io.WriteString(w, `{"jobId":"one"}`)
	}
	for i, ip := range []string{"192.0.2.1:1234", "198.51.100.2:55", "[2001:db8::3]:345"} {
		s := New(dir, nil)
		r := request(`{"type":"delete"}`, testKey, "profile-a")
		r.RemoteAddr = ip
		r.Header.Set("X-Forwarded-For", ip)
		w := response(wrapped(s, fn), r)
		if w.Code != 201 || w.Body.String() != `{"jobId":"one"}` {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		if (w.Header().Get(ReplayHeader) == "true") != (i > 0) {
			t.Fatal("incorrect replay marker")
		}
	}
	if calls != 1 {
		t.Fatalf("executed %d times", calls)
	}
	entries, _ := os.ReadDir(dir)
	info, _ := entries[0].Info()
	if info.Mode().Perm() != 0600 {
		t.Fatal("receipt permissions")
	}
}
func TestScopeAndIntentCannotCross(t *testing.T) {
	s := New(t.TempDir(), nil)
	calls := 0
	h := wrapped(s, func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(201) })
	if response(h, request("a", testKey, "a")).Code != 201 {
		t.Fatal("first")
	}
	if response(h, request("b", testKey, "a")).Code != 409 {
		t.Fatal("changed body accepted")
	}
	if response(h, request("a", testKey, "b")).Code != 201 {
		t.Fatal("different profile blocked")
	}
	r := request("a", testKey, "a")
	r.Method = "DELETE"
	if response(h, r).Code != 409 {
		t.Fatal("changed method accepted")
	}
	r = request("a", testKey, "a")
	r.URL.RawQuery = "x=1"
	if response(h, r).Code != 409 {
		t.Fatal("changed query accepted")
	}
	if calls != 2 {
		t.Fatal(calls)
	}
}
func TestDisconnectThenDifferentTCPSource(t *testing.T) {
	var calls atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	done := make(chan struct{})
	sources := make(chan string, 100)
	h := wrapped(New(t.TempDir(), nil), func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(started)
		<-release
		if r.Context().Err() != nil {
			t.Error("accepted operation canceled on disconnect")
		}
		w.WriteHeader(201)
		io.WriteString(w, "done")
		close(done)
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sources <- strings.Split(r.RemoteAddr, ":")[0]
		h.ServeHTTP(w, r)
	}))
	defer srv.Close()
	client := func(ip string) *http.Client {
		d := net.Dialer{LocalAddr: &net.TCPAddr{IP: net.ParseIP(ip)}}
		tr := &http.Transport{DialContext: d.DialContext}
		t.Cleanup(tr.CloseIdleConnections)
		return &http.Client{Transport: tr, Timeout: 5 * time.Second}
	}
	first, second := client("127.0.0.2"), client("127.0.0.3")
	ctx, cancel := context.WithCancel(context.Background())
	r, _ := http.NewRequestWithContext(ctx, "POST", srv.URL+"/jobs", strings.NewReader("same"))
	r.Header.Set(Header, testKey)
	ended := make(chan error, 1)
	go func() {
		res, err := first.Do(r)
		if res != nil {
			res.Body.Close()
		}
		ended <- err
	}()
	<-started
	cancel()
	if <-ended == nil {
		t.Fatal("first request should lose response")
	}
	retry := func() *http.Response {
		r, _ := http.NewRequest("POST", srv.URL+"/jobs", strings.NewReader("same"))
		r.Header.Set(Header, testKey)
		res, e := second.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		return res
	}
	res := retry()
	io.Copy(io.Discard, res.Body)
	res.Body.Close()
	if res.StatusCode != 409 {
		t.Fatalf("pending: %d", res.StatusCode)
	}
	close(release)
	<-done
	for i := 0; i < 30; i++ {
		res = retry()
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode == 201 {
			if string(body) != "done" || res.Header.Get(ReplayHeader) != "true" {
				t.Fatal("bad replay")
			}
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if res.StatusCode != 201 || calls.Load() != 1 {
		t.Fatalf("status=%d actions=%d", res.StatusCode, calls.Load())
	}
	if <-sources != "127.0.0.2" || <-sources != "127.0.0.3" {
		t.Fatal("test did not change TCP source address")
	}
}
func TestUnknownCrashNeverReexecutes(t *testing.T) {
	dir := t.TempDir()
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("expected handler panic")
			}
		}()
		response(wrapped(New(dir, nil), func(w http.ResponseWriter, r *http.Request) { panic("simulated crash after side effect") }), request("a", testKey, "a"))
	}()
	called := false
	w := response(wrapped(New(dir, nil), func(w http.ResponseWriter, r *http.Request) { called = true }), request("a", testKey, "a"))
	if called || w.Code != 409 || !strings.Contains(w.Body.String(), "operation_outcome_unknown") {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestInputsAndDiskFailClosed(t *testing.T) {
	for _, tc := range []struct {
		name, key, body string
		status          int
	}{{"invalid key", "short", "a", 400}, {"oversized", testKey, strings.Repeat("x", maxRequestBytes+1), 413}} {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			w := response(wrapped(New(t.TempDir(), nil), func(w http.ResponseWriter, r *http.Request) { called = true }), request(tc.body, tc.key, "a"))
			if called || w.Code != tc.status {
				t.Fatal(w.Code)
			}
		})
	}
	t.Run("no data dir", func(t *testing.T) {
		w := response(wrapped(New("", nil), func(w http.ResponseWriter, r *http.Request) { t.Fatal("executed") }), request("a", testKey, "a"))
		if w.Code != 503 {
			t.Fatal(w.Code)
		}
	})
	t.Run("pre canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		response(wrapped(New(t.TempDir(), nil), func(w http.ResponseWriter, r *http.Request) { t.Fatal("executed") }), request("a", testKey, "a").WithContext(ctx))
	})
	t.Run("unreadable body", func(t *testing.T) {
		r := request("", testKey, "a")
		r.Body = io.NopCloser(badReader{})
		w := response(wrapped(New(t.TempDir(), nil), func(w http.ResponseWriter, r *http.Request) { t.Fatal("executed") }), r)
		if w.Code != 400 {
			t.Fatal(w.Code)
		}
	})
}

type badReader struct{}

func (badReader) Read([]byte) (int, error) { return 0, errors.New("connection lost") }
func TestRecordedFailureAndLimits(t *testing.T) {
	s := New(t.TempDir(), nil)
	calls := 0
	h := wrapped(s, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(503)
		io.WriteString(w, "provider failed")
	})
	for i := 0; i < 2; i++ {
		if response(h, request("a", testKey, "a")).Code != 503 {
			t.Fatal("status")
		}
	}
	if calls != 1 {
		t.Fatal(calls)
	}
	s.count = maxRecords
	s.lastPrune = time.Now()
	w := response(h, request("b", testKey+"b", "a"))
	if w.Code != 503 || calls != 1 {
		t.Fatal("capacity did not fail closed")
	}
}
func TestShutdownAndResponseOverflow(t *testing.T) {
	t.Run("shutdown", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		h := wrapped(New(t.TempDir(), ctx), func(w http.ResponseWriter, r *http.Request) {
			select {
			case <-r.Context().Done():
			case <-time.After(time.Second):
				t.Fatal("shutdown did not cancel")
			}
			w.WriteHeader(503)
		})
		response(h, request("a", testKey, "a"))
	})
	t.Run("overflow remains unknown", func(t *testing.T) {
		s := New(t.TempDir(), nil)
		response(wrapped(s, func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, strings.Repeat("x", maxResponseBytes+1))
		}), request("a", testKey, "a"))
		w := response(wrapped(s, func(w http.ResponseWriter, r *http.Request) { t.Fatal("executed twice") }), request("a", testKey, "a"))
		if w.Code != 409 {
			t.Fatal(w.Code)
		}
	})
}
func TestPruneNeverDeletesUnconfirmedIntent(t *testing.T) {
	dir := t.TempDir()
	s := New(dir, nil)
	id := sum("x")
	_, _, e := s.reserve(id, "digest")
	if e != nil {
		t.Fatal(e)
	}
	delete(s.running, id)
	old := time.Now().Add(-48 * time.Hour)
	os.Chtimes(filepath.Join(dir, id+".json"), old, old)
	s.lastPrune = time.Time{}
	_, _, e = s.reserve(sum("new"), "new")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(filepath.Join(dir, id+".json")); e != nil {
		t.Fatal("unknown pending receipt deleted")
	}
}

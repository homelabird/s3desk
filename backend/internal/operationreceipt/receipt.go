// Package operationreceipt durably replays selected authenticated control
// requests. Unknown outcomes fail closed. This is NOT an exactly-once remote
// transaction. One running S3Desk instance per DATA_DIR is supported.
package operationreceipt

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

const Header = "Idempotency-Key"
const ReplayHeader = "Idempotency-Replayed"
const TTL = 24 * time.Hour
const maxRequestBytes = 8 << 20
const maxResponseBytes = 1 << 20
const maxRecords = 16384
const maxInFlight = 16

var validKey = regexp.MustCompile(`^[A-Za-z0-9_-]{16,128}$`)

type receipt struct {
	Digest   string      `json:"digest"`
	Created  time.Time   `json:"created"`
	Complete bool        `json:"complete"`
	Status   int         `json:"status,omitempty"`
	Headers  http.Header `json:"headers,omitempty"`
	Body     []byte      `json:"body,omitempty"`
}
type Store struct {
	dir       string
	shutdown  context.Context
	mu        sync.Mutex
	running   map[string]bool
	count     int
	lastPrune time.Time
	now       func() time.Time
}

func New(dir string, shutdown context.Context) *Store {
	if shutdown == nil {
		shutdown = context.Background()
	}
	return &Store{dir: dir, shutdown: shutdown, running: make(map[string]bool), now: time.Now}
}
func sum(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }

// Wrap must be placed AFTER token/profile authorization. The supplied scope is
// the account and profile, never a source IP. Bulk streaming endpoints must not
// use this middleware, nor endpoints returning credentials or signed URLs.
func (s *Store) Wrap(scope func(*http.Request) string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get(Header)
		if key == "" {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if !validKey.MatchString(key) {
			fail(w, 400, "invalid_operation_key", "Invalid operation key.")
			return
		}
		if r.Context().Err() != nil {
			return
		}
		var body []byte
		var err error
		if r.Body != nil {
			body, err = io.ReadAll(io.LimitReader(r.Body, maxRequestBytes+1))
			_ = r.Body.Close()
		}
		if err != nil {
			fail(w, 400, "incomplete_request", "Request body was not received; no new operation was started.")
			return
		}
		if len(body) > maxRequestBytes {
			fail(w, 413, "request_too_large", "Operation request is too large.")
			return
		}
		if r.Context().Err() != nil {
			return
		}
		raw, _ := json.Marshal([]string{r.Method, r.URL.EscapedPath(), r.URL.RawQuery, r.Header.Get("Content-Type"), string(body)})
		digest, id := sum(string(raw)), sum(scope(r)+"\x00"+key)
		prior, running, err := s.reserve(id, digest)
		if err != nil {
			fail(w, 503, "operation_receipt_unavailable", "Cannot access durable operation state. No NEW operation was started; retry with the same key.")
			return
		}
		if prior != nil {
			if prior.Digest != digest {
				fail(w, 409, "operation_key_conflict", "This key was used for another request.")
				return
			}
			if !prior.Complete {
				if running {
					w.Header().Set("Retry-After", "2")
					fail(w, 409, "operation_in_progress", "Original operation still running; retry with the same key.")
				} else {
					fail(w, 409, "operation_outcome_unknown", "Result was not recorded. Check Jobs and object state; this operation will not be repeated automatically.")
				}
				return
			}
			replay(w, prior, true)
			return
		}
		defer func() { s.mu.Lock(); delete(s.running, id); s.mu.Unlock() }()
		// Once accepted, losing the browser connection must not abort a control
		// operation midway. A finite deadline and server shutdown still cancel it.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Minute)
		stop := context.AfterFunc(s.shutdown, cancel)
		defer func() { stop(); cancel() }()
		req := r.Clone(ctx)
		req.Body = io.NopCloser(bytes.NewReader(body))
		capture := &responseBuffer{headers: make(http.Header)}
		next.ServeHTTP(capture, req)
		if capture.tooLarge {
			fail(w, 503, "operation_outcome_unknown", "Response exceeded the receipt limit; check Jobs and object state.")
			return
		}
		status := capture.status
		if status == 0 {
			status = 200
		}
		rec := &receipt{Digest: digest, Created: s.now(), Complete: true, Status: status, Headers: make(http.Header), Body: capture.body.Bytes()}
		for _, h := range []string{"Content-Type", "Retry-After"} {
			if v := capture.headers.Get(h); v != "" {
				rec.Headers.Set(h, v)
			}
		}
		if err := s.finish(id, rec); err != nil {
			fail(w, 503, "operation_outcome_unknown", "Operation may have finished but its result was not recorded. Check Jobs and object state.")
			return
		}
		replay(w, rec, false)
	})
}
func (s *Store) reserve(id, digest string) (*receipt, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.dir == "" {
		return nil, false, errors.New("receipt directory not configured")
	}
	if err := os.MkdirAll(s.dir, 0700); err != nil {
		return nil, false, err
	}
	name := filepath.Join(s.dir, id+".json")
	data, err := os.ReadFile(name)
	if err == nil {
		var rec receipt
		if json.Unmarshal(data, &rec) != nil || rec.Digest == "" || rec.Created.IsZero() || (rec.Complete && (rec.Status < 200 || rec.Status > 599)) {
			return nil, false, errors.New("invalid receipt")
		}
		return &rec, s.running[id], nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, false, err
	}
	if s.lastPrune.IsZero() || s.now().Sub(s.lastPrune) > time.Minute {
		entries, err := os.ReadDir(s.dir)
		if err != nil {
			return nil, false, err
		}
		s.count = 0
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
				continue
			}
			s.count++
			// Only old files can be eligible. Do not read all response bodies on every sweep.
			info, e := entry.Info()
			if e != nil || s.now().Sub(info.ModTime()) <= TTL {
				continue
			}
			raw, e := os.ReadFile(filepath.Join(s.dir, entry.Name()))
			if e != nil {
				continue
			}
			var rec receipt
			if json.Unmarshal(raw, &rec) == nil && rec.Complete && s.now().Sub(rec.Created) > TTL {
				if os.Remove(filepath.Join(s.dir, entry.Name())) == nil {
					s.count--
				}
			}
		}
		s.lastPrune = s.now()
	}
	if s.count >= maxRecords || len(s.running) >= maxInFlight {
		return nil, false, errors.New("receipt capacity exhausted")
	}
	raw, _ := json.Marshal(receipt{Digest: digest, Created: s.now()})
	f, err := os.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil, false, err
	}
	_, e1 := f.Write(raw)
	e2 := f.Sync()
	e3 := f.Close()
	if e1 != nil || e2 != nil || e3 != nil {
		return nil, false, errors.New("reservation not durable")
	}
	if err := syncDir(s.dir); err != nil {
		return nil, false, err
	}
	s.count++
	s.running[id] = true
	return nil, false, nil
}
func (s *Store) finish(id string, rec *receipt) error {
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(s.dir, ".receipt-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	_, e1 := f.Write(raw)
	e2 := f.Sync()
	e3 := f.Close()
	if e1 != nil || e2 != nil || e3 != nil {
		return errors.New("receipt save failed")
	}
	if err := os.Rename(name, filepath.Join(s.dir, id+".json")); err != nil {
		return err
	}
	return syncDir(s.dir)
}
func syncDir(dir string) error {
	f, e := os.Open(dir)
	if e != nil {
		return e
	}
	defer f.Close()
	return f.Sync()
}
func replay(w http.ResponseWriter, rec *receipt, replayed bool) {
	for _, h := range []string{"Content-Type", "Retry-After"} {
		if v := rec.Headers.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set(ReplayHeader, "false")
	if replayed {
		w.Header().Set(ReplayHeader, "true")
	}
	w.WriteHeader(rec.Status)
	_, _ = w.Write(rec.Body)
}
func fail(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": code, "message": message}})
}

type responseBuffer struct {
	headers  http.Header
	status   int
	body     bytes.Buffer
	tooLarge bool
}

func (b *responseBuffer) Header() http.Header { return b.headers }
func (b *responseBuffer) WriteHeader(status int) {
	if b.status == 0 {
		b.status = status
	}
}
func (b *responseBuffer) Write(p []byte) (int, error) {
	if b.status == 0 {
		b.status = 200
	}
	if b.body.Len()+len(p) > maxResponseBytes {
		b.tooLarge = true
		return 0, errors.New("response too large")
	}
	return b.body.Write(p)
}

package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRequestBodyIdleTimeoutAllowsFastBody(t *testing.T) {
	srv := newRequestBodyTimeoutTestServer(t, 25*time.Millisecond, 100*time.Millisecond)
	if status := postRequestBodyTimeoutTest(t, srv, "/control", strings.NewReader("fast"), 4); status != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", status, http.StatusNoContent)
	}
}

func TestRequestBodyIdleTimeoutStopsSlowControlBody(t *testing.T) {
	srv := newRequestBodyTimeoutTestServer(t, 25*time.Millisecond, 100*time.Millisecond)
	if status := postRequestBodyTimeoutTest(t, srv, "/control", &pacedRequestBody{pause: 100 * time.Millisecond}, -1); status != http.StatusRequestTimeout {
		t.Fatalf("status=%d, want %d", status, http.StatusRequestTimeout)
	}
}

func TestRequestBodyIdleTimeoutUsesLongerStreamingUploadWindow(t *testing.T) {
	srv := newRequestBodyTimeoutTestServer(t, 25*time.Millisecond, 150*time.Millisecond)
	if status := postRequestBodyTimeoutTest(t, srv, "/api/v1/uploads/upload-1/files", &pacedRequestBody{pause: 75 * time.Millisecond}, -1); status != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", status, http.StatusNoContent)
	}
}

func newRequestBodyTimeoutTestServer(t *testing.T, controlTimeout, uploadTimeout time.Duration) *httptest.Server {
	t.Helper()

	handler := requestBodyIdleTimeoutFor(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.ReadAll(r.Body); err != nil {
			w.WriteHeader(http.StatusRequestTimeout)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}), controlTimeout, uploadTimeout)
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv
}

func postRequestBodyTimeoutTest(t *testing.T, srv *httptest.Server, path string, body io.Reader, contentLength int64) int {
	t.Helper()

	req, err := http.NewRequest(http.MethodPost, srv.URL+path, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if contentLength >= 0 {
		req.ContentLength = contentLength
	} else {
		req.ContentLength = -1
	}
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("post body: %v", err)
	}
	defer res.Body.Close()
	return res.StatusCode
}

type pacedRequestBody struct {
	sent  bool
	pause time.Duration
}

func (b *pacedRequestBody) Read(p []byte) (int, error) {
	if b.sent {
		time.Sleep(b.pause)
		return 0, io.EOF
	}
	b.sent = true
	p[0] = 'x'
	return 1, nil
}

func (b *pacedRequestBody) Close() error { return nil }

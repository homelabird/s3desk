package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/ws"
)

func newPublicRoutesHandler(t *testing.T, allowRemote bool) http.Handler {
	t.Helper()

	root := t.TempDir()
	staticDir := filepath.Join(root, "ui")
	if err := os.MkdirAll(staticDir, 0o700); err != nil {
		t.Fatalf("mkdir static dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "index.html"), []byte("<!doctype html><html><body>ui</body></html>"), 0o600); err != nil {
		t.Fatalf("write index.html: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "openapi.yml"), []byte("openapi: 3.0.0\ninfo:\n  title: test\n  version: 1.0.0\npaths: {}\n"), 0o600); err != nil {
		t.Fatalf("write openapi.yml: %v", err)
	}

	return New(Dependencies{
		Config: config.Config{
			Addr:        "127.0.0.1:0",
			StaticDir:   staticDir,
			AllowRemote: allowRemote,
		},
		Hub:        ws.NewHub(),
		ServerAddr: "127.0.0.1:0",
	})
}

func TestPublicRoutesRequireLocalHostByDefault(t *testing.T) {
	t.Parallel()

	handler := newPublicRoutesHandler(t, false)

	tests := []struct {
		name string
		path string
	}{
		{name: "docs", path: "/docs"},
		{name: "openapi", path: "/openapi.yml"},
		{name: "healthz", path: "/healthz"},
		{name: "readyz", path: "/readyz"},
		{name: "download proxy", path: "/download-proxy"},
		{name: "ui root", path: "/"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://10.1.2.10:8080"+tc.path, nil)
			req.RemoteAddr = "10.1.2.3:1234"
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusForbidden {
				body, _ := io.ReadAll(rr.Body)
				t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusForbidden, string(body))
			}
		})
	}
}

func TestPublicRoutesAllowPrivateRemoteWhenAllowRemoteEnabled(t *testing.T) {
	t.Parallel()

	handler := newPublicRoutesHandler(t, true)

	tests := []struct {
		name       string
		path       string
		wantStatus int
		wantBody   string
	}{
		{name: "docs", path: "/docs", wantStatus: http.StatusOK, wantBody: "swagger-ui"},
		{name: "openapi", path: "/openapi.yml", wantStatus: http.StatusOK, wantBody: "openapi: 3.0.0"},
		{name: "healthz", path: "/healthz", wantStatus: http.StatusOK, wantBody: "ok\n"},
		{name: "ui root", path: "/", wantStatus: http.StatusOK, wantBody: "<!doctype html>"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://10.1.2.10:8080"+tc.path, nil)
			req.RemoteAddr = "10.1.2.3:1234"
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if rr.Code != tc.wantStatus {
				body, _ := io.ReadAll(rr.Body)
				t.Fatalf("status=%d, want %d body=%s", rr.Code, tc.wantStatus, string(body))
			}
			body, _ := io.ReadAll(rr.Body)
			if tc.wantBody != "" && !strings.Contains(string(body), tc.wantBody) {
				t.Fatalf("body=%q, want substring %q", string(body), tc.wantBody)
			}
		})
	}
}

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
	"s3desk/internal/models"
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
	if err := os.Mkdir(filepath.Join(staticDir, "assets"), 0o700); err != nil {
		t.Fatalf("mkdir assets: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "assets", "app-hash.js"), []byte("export {}"), 0o600); err != nil {
		t.Fatalf("write asset: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "icon.png"), []byte("png"), 0o600); err != nil {
		t.Fatalf("write public asset: %v", err)
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

func TestUIStaticCachePolicy(t *testing.T) {
	t.Parallel()

	handler := newPublicRoutesHandler(t, false)
	tests := []struct {
		path string
		want string
	}{
		{path: "/assets/app-hash.js", want: "public, max-age=31536000, immutable"},
		{path: "/icon.png", want: "public, max-age=86400"},
		{path: "/", want: "no-cache"},
		{path: "/profiles", want: "no-cache"},
	}

	for _, tc := range tests {
		t.Run(tc.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1"+tc.path, nil)
			req.RemoteAddr = "127.0.0.1:1234"
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if got := rr.Header().Get("Cache-Control"); got != tc.want {
				t.Fatalf("Cache-Control=%q, want %q", got, tc.want)
			}
		})
	}
}

func TestUIMissingAssetReturnsNotFound(t *testing.T) {
	t.Parallel()

	handler := newPublicRoutesHandler(t, false)
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/assets/missing-hash.js", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusNotFound)
	}
	if got := rr.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/plain") {
		t.Fatalf("Content-Type=%q, want text/plain", got)
	}
	if strings.Contains(rr.Body.String(), "<!doctype html>") {
		t.Fatalf("missing asset returned SPA index: %q", rr.Body.String())
	}
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
		{name: "workerz", path: "/workerz"},
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

func TestPublicDownloadProxyRouteAllowsPrivateRemoteCustomPortWhenAllowRemoteEnabled(t *testing.T) {
	t.Parallel()

	handler := newPublicRoutesHandler(t, true)
	req := httptest.NewRequest(http.MethodGet, "http://10.1.2.10:9443/download-proxy?profileId=p1&bucket=test-bucket&key=report.txt&expires=bad&sig=test-signature", nil)
	req.RemoteAddr = "10.1.2.3:1234"
	req.Header.Set("Forwarded", `for=203.0.113.10;proto=https;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d body=%s", res.StatusCode, http.StatusBadRequest, string(body))
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
	if got := resp.Error.Details["expires"]; got != "bad" {
		t.Fatalf("details.expires=%v, want bad", got)
	}
}

func TestPublicDownloadProxyRouteRegistersHeadWhenAllowRemoteEnabled(t *testing.T) {
	t.Parallel()

	handler := newPublicRoutesHandler(t, true)
	req := httptest.NewRequest(http.MethodHead, "http://10.1.2.10:9443/download-proxy?profileId=p1&bucket=test-bucket&key=report.txt&expires=bad&sig=test-signature", nil)
	req.RemoteAddr = "10.1.2.3:1234"
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestPublicDownloadProxyRouteRejectsPublicPeerDespiteForwardedPrivateHeaders(t *testing.T) {
	t.Parallel()

	handler := newPublicRoutesHandler(t, true)
	req := httptest.NewRequest(http.MethodGet, "http://10.1.2.10:9443/download-proxy?profileId=p1&bucket=test-bucket&key=report.txt&expires=bad&sig=test-signature", nil)
	req.RemoteAddr = "203.0.113.10:1234"
	req.Header.Set("Forwarded", `for=10.1.2.3;proto=https;host="10.1.2.10:9443"`)
	req.Header.Set("X-Forwarded-For", "10.1.2.3")
	req.Header.Set("X-Real-IP", "10.1.2.4")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d body=%s", res.StatusCode, http.StatusForbidden, string(body))
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "forbidden" {
		t.Fatalf("resp.Error.Code=%q, want forbidden", resp.Error.Code)
	}
	if resp.Error.Message != "remote address must be localhost or private" {
		t.Fatalf("resp.Error.Message=%q, want remote address must be localhost or private", resp.Error.Message)
	}
}

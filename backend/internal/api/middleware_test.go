package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"object-storage/internal/config"
	"object-storage/internal/models"
)

func TestSecurityHeaders_Default(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/", nil)

	securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if got := rr.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("X-Frame-Options=%q, want %q", got, "DENY")
	}
	if got := rr.Header().Get("Content-Security-Policy"); got != "frame-ancestors 'none'" {
		t.Fatalf("Content-Security-Policy=%q, want %q", got, "frame-ancestors 'none'")
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want %q", got, "same-origin")
	}
	if got := rr.Header().Get("Cross-Origin-Resource-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Resource-Policy=%q, want %q", got, "same-origin")
	}
	if got := rr.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options=%q, want %q", got, "nosniff")
	}
	if got := rr.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Fatalf("Referrer-Policy=%q, want %q", got, "no-referrer")
	}
}

func TestSecurityHeaders_SkipsCOOPOnUntrustedOrigin(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://172.18.34.4:8080/", nil)

	securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want empty", got)
	}
	if got := rr.Header().Get("Cross-Origin-Resource-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Resource-Policy=%q, want %q", got, "same-origin")
	}
}

func TestSecurityHeaders_DoesNotOverrideExistingValues(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/", nil)

	pre := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Frame-Options", "SAMEORIGIN")
			w.Header().Set("Content-Security-Policy", "default-src 'self'")
			w.Header().Set("Cross-Origin-Opener-Policy", "unsafe-none")
			w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
			w.Header().Set("X-Content-Type-Options", "keep")
			w.Header().Set("Referrer-Policy", "same-origin")
			next.ServeHTTP(w, r)
		})
	}

	pre(securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))).ServeHTTP(rr, req)

	if got := rr.Header().Get("X-Frame-Options"); got != "SAMEORIGIN" {
		t.Fatalf("X-Frame-Options=%q, want %q", got, "SAMEORIGIN")
	}
	if got := rr.Header().Get("Content-Security-Policy"); got != "default-src 'self'" {
		t.Fatalf("Content-Security-Policy=%q, want %q", got, "default-src 'self'")
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "unsafe-none" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want %q", got, "unsafe-none")
	}
	if got := rr.Header().Get("Cross-Origin-Resource-Policy"); got != "cross-origin" {
		t.Fatalf("Cross-Origin-Resource-Policy=%q, want %q", got, "cross-origin")
	}
	if got := rr.Header().Get("X-Content-Type-Options"); got != "keep" {
		t.Fatalf("X-Content-Type-Options=%q, want %q", got, "keep")
	}
	if got := rr.Header().Get("Referrer-Policy"); got != "same-origin" {
		t.Fatalf("Referrer-Policy=%q, want %q", got, "same-origin")
	}
}

func TestRequireLocalHost_BlocksCrossSiteFetchMetadata(t *testing.T) {
	t.Parallel()

	s := &server{}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("Sec-Fetch-Site", "cross-site")

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "forbidden" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "forbidden")
	}
}

func TestRequireLocalHost_AllowsSameSiteFetchMetadata(t *testing.T) {
	t.Parallel()

	s := &server{}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("Sec-Fetch-Site", "same-site")

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestRequireLocalHost_RejectsPrivateRemoteAddrByDefault(t *testing.T) {
	t.Parallel()

	s := &server{}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/v1/meta", nil)
	req.RemoteAddr = "10.1.2.3:1234"

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestRequireLocalHost_AllowsPrivateRemoteAddrWhenAllowRemoteEnabled(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{AllowRemote: true}}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/v1/meta", nil)
	req.RemoteAddr = "10.1.2.3:1234"

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestRequireLocalHost_RejectsPrivateHostByDefault(t *testing.T) {
	t.Parallel()

	s := &server{}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://172.18.34.4:8080/api/v1/meta", nil)
	req.RemoteAddr = "127.0.0.1:1234"

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestRequireLocalHost_AllowsExplicitAllowedHost(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{AllowedHosts: []string{"object-storage.local"}}}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://object-storage.local:8080/api/v1/meta", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("Origin", "http://object-storage.local:8080")

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestRequireLocalHost_AllowsPrivateHostWhenAllowRemoteEnabled(t *testing.T) {
	t.Parallel()

	s := &server{cfg: config.Config{AllowRemote: true}}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://172.18.34.4:8080/api/v1/meta", nil)
	req.RemoteAddr = "10.1.2.3:1234"
	req.Header.Set("Origin", "http://172.18.34.4:8080")

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestRequireLocalHost_RejectsPrivateOriginByDefault(t *testing.T) {
	t.Parallel()

	s := &server{}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/v1/meta", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("Origin", "http://10.1.2.3:8080")

	s.requireLocalHost(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
}

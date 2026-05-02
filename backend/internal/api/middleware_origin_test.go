package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
)

func TestOriginAccessMiddlewareService_PrepareLocalHostRequest_RejectsCrossSiteWithoutOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("Sec-Fetch-Site", "cross-site")

	err := svc.prepareLocalHostRequest(req)
	if err == nil {
		t.Fatal("expected prepare error")
	}
	if err.code != "forbidden" {
		t.Fatalf("err.code=%q, want forbidden", err.code)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_ReturnsAllowedOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "http://localhost:5173")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "http://localhost:5173" {
		t.Fatalf("prepared.allowedOrigin=%q, want http://localhost:5173", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_ReturnsAllowlistedIPv6ULAOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{AllowRemote: true, AllowedHosts: []string{"fd00::25"}}})
	req := httptest.NewRequest(http.MethodGet, "http://[fd00::25]:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://[FD00::25]:8443")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "https://[FD00::25]:8443" {
		t.Fatalf("prepared.allowedOrigin=%q, want https://[FD00::25]:8443", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_ReturnsAllowlistedMixedCaseHostOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}}})
	req := httptest.NewRequest(http.MethodGet, "http://s3desk.local:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://S3DESK.LOCAL.:8443")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "https://S3DESK.LOCAL.:8443" {
		t.Fatalf("prepared.allowedOrigin=%q, want https://S3DESK.LOCAL.:8443", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsNonAllowlistedIPv6ULAOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{AllowRemote: true, AllowedHosts: []string{"fd00::25"}}})
	req := httptest.NewRequest(http.MethodGet, "http://[fd00::25]:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "http://[fd00::26]:8080")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsOriginWithPath(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "http://localhost:5173/app")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsOriginWithTrailingSlash(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://localhost:5173/")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsOriginWithQuery(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://localhost:5173?from=app")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsOriginWithFragment(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://localhost:5173#stale-fragment")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsOriginWithUserinfo(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://user@localhost:5173")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsOriginWithEmptyHost(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://:5173")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsFileOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "file://localhost")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsUnsupportedSchemeOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "wss://localhost:8080")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsOriginWithOutOfRangePort(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "https://localhost:65536")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestOriginAccessMiddlewareService_PrepareCORSRequest_RejectsNullOrigin(t *testing.T) {
	t.Parallel()

	svc := newOriginAccessMiddlewareService(&server{cfg: config.Config{}})
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", nil)
	req.Header.Set("Origin", "null")

	prepared := svc.prepareCORSRequest(req)
	if prepared.allowedOrigin != "" {
		t.Fatalf("prepared.allowedOrigin=%q, want empty", prepared.allowedOrigin)
	}
}

func TestWriteCORSPreflight_ReturnsNoContentForAllowedOrigin(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "http://127.0.0.1:8080/api/v1/meta", nil)
	prepared := corsPreparedRequest{allowedOrigin: "http://localhost:5173"}
	applyCORSHeaders(rr, prepared)

	if !writeCORSPreflight(rr, req, prepared) {
		t.Fatal("expected preflight short-circuit")
	}
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusNoContent)
	}
}

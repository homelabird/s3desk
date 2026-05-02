package api

import (
	"crypto/tls"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestPrepareSecurityHeadersRequest_EnablesCOOPAndHSTSForTrustedTLS(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://localhost:8443/", nil)
	req.TLS = &tls.ConnectionState{}

	prepared := prepareSecurityHeadersRequest(req)
	if !prepared.trustworthyOrigin {
		t.Fatalf("trustworthyOrigin=false, want true")
	}
	if !prepared.secureTransport {
		t.Fatalf("secureTransport=false, want true")
	}
}

func TestPrepareSecurityHeadersRequest_TrustsNormalizedLoopbackHostsWithoutTLS(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		host string
		want bool
	}{
		{
			name: "mixed-case trailing-dot localhost host",
			host: "LOCALHOST.:8080",
			want: true,
		},
		{
			name: "bracketed ipv6 loopback host",
			host: "[::1]:8080",
			want: true,
		},
		{
			name: "mixed-case trailing-dot localhost subdomain host",
			host: "APP.LOCALHOST.:8080",
			want: true,
		},
		{
			name: "non-loopback host remains untrusted",
			host: "s3desk.local.:8080",
			want: false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, "http://example.invalid/ui", nil)
			req.Host = tc.host

			prepared := prepareSecurityHeadersRequest(req)
			if prepared.trustworthyOrigin != tc.want {
				t.Fatalf("trustworthyOrigin=%v, want %v", prepared.trustworthyOrigin, tc.want)
			}
			if prepared.secureTransport {
				t.Fatal("secureTransport=true, want false for non-TLS request")
			}
		})
	}
}

func TestSecurityHeaders_SetsCOOPForNormalizedLoopbackHostWithoutTLS(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://example.invalid/ui", nil)
	req.Host = "LOCALHOST.:8080"

	securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want %q", got, "same-origin")
	}
	if got := rr.Header().Get("Strict-Transport-Security"); got != "" {
		t.Fatalf("Strict-Transport-Security=%q, want empty on non-TLS request", got)
	}
}

func TestSecurityHeaders_SetsCOOPForNormalizedLocalhostSubdomainWithoutTLS(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://example.invalid/ui", nil)
	req.Host = "APP.LOCALHOST.:8080"

	securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want %q", got, "same-origin")
	}
	if got := rr.Header().Get("Strict-Transport-Security"); got != "" {
		t.Fatalf("Strict-Transport-Security=%q, want empty on non-TLS request", got)
	}
}

func TestPrepareSecurityHeadersRequest_DoesNotTrustForwardedProtoForSecureTransport(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		host      string
		forwarded string
		xfProto   string
		wantCOOP  bool
	}{
		{
			name:      "loopback host keeps coop without forwarded tls trust",
			host:      "LOCALHOST.:8080",
			forwarded: "for=127.0.0.1;proto=https",
			xfProto:   "https",
			wantCOOP:  true,
		},
		{
			name:      "remote host stays untrusted despite forwarded tls headers",
			host:      "s3desk.local.:8080",
			forwarded: "for=192.168.1.20;proto=https;host=s3desk.local",
			xfProto:   "https",
			wantCOOP:  false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, "http://example.invalid/ui", nil)
			req.Host = tc.host
			req.Header.Set("Forwarded", tc.forwarded)
			req.Header.Set("X-Forwarded-Proto", tc.xfProto)

			prepared := prepareSecurityHeadersRequest(req)
			if prepared.trustworthyOrigin != tc.wantCOOP {
				t.Fatalf("trustworthyOrigin=%v, want %v", prepared.trustworthyOrigin, tc.wantCOOP)
			}
			if prepared.secureTransport {
				t.Fatal("secureTransport=true, want false when request has no TLS state")
			}
		})
	}
}

func TestSecurityHeaders_DoesNotSetHSTSFromForwardedProto(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://example.invalid/ui", nil)
	req.Host = "LOCALHOST.:8080"
	req.Header.Set("Forwarded", "for=127.0.0.1;proto=https")
	req.Header.Set("X-Forwarded-Proto", "https")

	securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want %q", got, "same-origin")
	}
	if got := rr.Header().Get("Strict-Transport-Security"); got != "" {
		t.Fatalf("Strict-Transport-Security=%q, want empty when only forwarded proto claims https", got)
	}
}

func TestPrepareSecurityHeadersRequest_DoesNotTrustForwardedHostForTrustworthyOrigin(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		host      string
		forwarded string
		xfHost    string
		wantCOOP  bool
	}{
		{
			name:      "remote host stays untrusted despite forwarded localhost host",
			host:      "s3desk.local.:8080",
			forwarded: `for=192.168.1.20;proto=http;host="LOCALHOST.:8443"`,
			xfHost:    "LOCALHOST.:8443",
			wantCOOP:  false,
		},
		{
			name:      "loopback host stays trusted despite spoofed remote forwarded host",
			host:      "LOCALHOST.:8080",
			forwarded: `for=127.0.0.1;proto=http;host="evil.example:7443"`,
			xfHost:    "evil.example:7443",
			wantCOOP:  true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, "http://example.invalid/ui", nil)
			req.Host = tc.host
			req.Header.Set("Forwarded", tc.forwarded)
			req.Header.Set("X-Forwarded-Host", tc.xfHost)

			prepared := prepareSecurityHeadersRequest(req)
			if prepared.trustworthyOrigin != tc.wantCOOP {
				t.Fatalf("trustworthyOrigin=%v, want %v", prepared.trustworthyOrigin, tc.wantCOOP)
			}
			if prepared.secureTransport {
				t.Fatal("secureTransport=true, want false when request has no TLS state")
			}
		})
	}
}

func TestSecurityHeaders_DoesNotSetCOOPFromForwardedHost(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://example.invalid/ui", nil)
	req.Host = "s3desk.local.:8080"
	req.Header.Set("Forwarded", `for=192.168.1.20;proto=http;host="LOCALHOST.:8443"`)
	req.Header.Set("X-Forwarded-Host", "LOCALHOST.:8443")

	securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want empty when only forwarded host claims loopback", got)
	}
	if got := rr.Header().Get("Strict-Transport-Security"); got != "" {
		t.Fatalf("Strict-Transport-Security=%q, want empty on non-TLS request", got)
	}
}

func TestPrepareSecurityHeadersRequest_DoesNotDowngradeFromForwardedHeaders(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://example.invalid/ui", nil)
	req.Host = "LOCALHOST.:8443"
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=http;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Proto", "http")
	req.Header.Set("X-Forwarded-Host", "evil.example:7443")

	prepared := prepareSecurityHeadersRequest(req)
	if !prepared.trustworthyOrigin {
		t.Fatal("trustworthyOrigin=false, want true for actual loopback TLS request")
	}
	if !prepared.secureTransport {
		t.Fatal("secureTransport=false, want true for actual TLS request")
	}
}

func TestSecurityHeaders_DoesNotDowngradeFromForwardedHeaders(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "https://example.invalid/ui", nil)
	req.Host = "LOCALHOST.:8443"
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=http;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Proto", "http")
	req.Header.Set("X-Forwarded-Host", "evil.example:7443")

	securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want %q", got, "same-origin")
	}
	if got := rr.Header().Get("Strict-Transport-Security"); got != "max-age=31536000; includeSubDomains; preload" {
		t.Fatalf("Strict-Transport-Security=%q, want HSTS for actual TLS request", got)
	}
}

func TestApplySecurityHeaders_SetsDefaultHeaders(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	applySecurityHeaders(rr, securityHeadersPreparedRequest{trustworthyOrigin: true, secureTransport: true})

	if got := rr.Header().Get("Content-Security-Policy"); got != defaultContentSecurityPolicy {
		t.Fatalf("Content-Security-Policy=%q, want %q", got, defaultContentSecurityPolicy)
	}
	if got := rr.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Opener-Policy=%q, want %q", got, "same-origin")
	}
	if got := rr.Header().Get("Strict-Transport-Security"); got != "max-age=31536000; includeSubDomains; preload" {
		t.Fatalf("Strict-Transport-Security=%q, want HSTS", got)
	}
}

func TestPrepareAllowedMethodRequest_RejectsTrace(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodTrace, "http://127.0.0.1:8080/api/v1/meta", nil)
	err := prepareAllowedMethodRequest(req)
	if err == nil {
		t.Fatal("expected error")
	}
	if err.status != http.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want %d", err.status, http.StatusMethodNotAllowed)
	}
	if err.allowHeader == "" {
		t.Fatal("allowHeader is empty")
	}
}

func TestWriteRequestMethodMiddlewareError_WritesInvalidRequestResponse(t *testing.T) {
	t.Parallel()

	rr := httptest.NewRecorder()
	writeRequestMethodMiddlewareError(rr, &requestMethodMiddlewareError{
		status:      http.StatusBadRequest,
		code:        "invalid_request",
		message:     "request body is not supported for this method",
		details:     map[string]any{"method": http.MethodGet},
		allowHeader: "GET, HEAD",
	})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
	if got := rr.Header().Get("Allow"); got != "GET, HEAD" {
		t.Fatalf("Allow=%q, want %q", got, "GET, HEAD")
	}
	var resp models.ErrorResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "invalid_request")
	}
}

func TestAllowOnlySafeMethods_RejectsUnexpectedBodyOnGet(t *testing.T) {
	t.Parallel()

	var nextCalled bool
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/meta", strings.NewReader("body"))

	(&server{}).allowOnlySafeMethods(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
	if nextCalled {
		t.Fatal("expected middleware to reject request")
	}
}

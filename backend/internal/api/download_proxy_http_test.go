package api

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestDownloadProxyHTTPService_HandleDownloadProxy_ReturnsMethodNotAllowed(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/download-proxy", nil)
	rr := httptest.NewRecorder()

	newDownloadProxyHTTPService(srv).handleDownloadProxy(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusMethodNotAllowed)
	}
}

func TestDownloadProxyHTTPService_HandleDownloadProxy_ReturnsInvalidSize(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/download-proxy?profileId=p1&bucket=test-bucket&key=report.txt&expires=123&sig=abc&size=bad", nil)
	rr := httptest.NewRecorder()

	newDownloadProxyHTTPService(srv).handleDownloadProxy(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
	if got, _ := resp.Error.Details["size"].(string); got != "bad" {
		t.Fatalf("resp.Error.Details[size]=%q, want bad", got)
	}
}

func TestDownloadProxyHTTPService_HandleDownloadProxy_ReturnsInvalidSignature(t *testing.T) {
	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	expiresAt := time.Now().UTC().Add(time.Minute).Unix()
	params := "profileId=p1&bucket=test-bucket&key=report.txt&expires=" + strconv.FormatInt(expiresAt, 10) + "&sig=bad"
	req := httptest.NewRequest(http.MethodGet, "/download-proxy?"+params, nil)
	rr := httptest.NewRecorder()

	newDownloadProxyHTTPService(srv).handleDownloadProxy(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusForbidden)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_signature" {
		t.Fatalf("resp.Error.Code=%q, want invalid_signature", resp.Error.Code)
	}
}

func TestExecutePreparedDownloadProxy_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newDownloadProxyHTTPService(&server{})

	_, _, _, _, _, _, _, _, err := svc.executePrepared(httptest.NewRequest(http.MethodGet, "/download-proxy", nil), downloadProxyPreparedRequest{
		err: newDownloadProxyHTTPError(http.StatusBadRequest, "invalid_request", "expires is invalid", map[string]any{"expires": "bad"}),
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if err.Error() != "expires is invalid" {
		t.Fatalf("err=%q, want expires is invalid", err.Error())
	}
}

func TestExecuteProxy_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newDownloadProxyHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/download-proxy?profileId=profile-1&bucket=bucket-a&key=object.txt&expires=bad&sig=test-signature", nil)

	_, _, _, _, _, _, _, _, err := svc.executeProxy(req)
	if err == nil {
		t.Fatal("expected error")
	}
	if err.Error() != "expires is invalid" {
		t.Fatalf("err=%q, want expires is invalid", err.Error())
	}
}

func TestParseForwardedProto_Table(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		value string
		want  string
	}{
		{
			name:  "quoted uppercase https is normalized",
			value: `for=127.0.0.1;proto="HTTPS"`,
			want:  "https",
		},
		{
			name:  "skips invalid proto and uses later trusted entry",
			value: `for=127.0.0.1;proto=ws, for=127.0.0.2;proto=http`,
			want:  "http",
		},
		{
			name:  "later quoted proto with surrounding spaces is normalized",
			value: `for=127.0.0.1;proto=ws;host="evil.example:8443", for=127.0.0.2;proto=" HTTPS "`,
			want:  "https",
		},
		{
			name:  "rejects unsupported proto",
			value: `for=127.0.0.1;proto=javascript`,
			want:  "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := parseForwardedProto(tc.value); got != tc.want {
				t.Fatalf("parseForwardedProto(%q)=%q, want %q", tc.value, got, tc.want)
			}
		})
	}
}

func TestRequestScheme_PolicyMatrix(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		forwarded string
		xfProto   string
		useTLS    bool
		urlValue  string
		want      string
	}{
		{
			name:      "forwarded https wins",
			forwarded: `for=127.0.0.1;proto="HTTPS"`,
			xfProto:   "http",
			want:      "https",
		},
		{
			name:      "invalid forwarded falls back to x forwarded proto",
			forwarded: `for=127.0.0.1;proto=ws`,
			xfProto:   "HTTPS, http",
			want:      "https",
		},
		{
			name:     "x forwarded proto only trusts first comma separated entry",
			xfProto:  "ws, https",
			useTLS:   true,
			urlValue: "http://internal.local/api/v1/objects",
			want:     "https",
		},
		{
			name:     "invalid x forwarded proto falls back to tls",
			xfProto:  "ws",
			useTLS:   true,
			urlValue: "http://internal.local/api/v1/objects",
			want:     "https",
		},
		{
			name:     "url scheme used when no trusted forwarding headers",
			urlValue: "https://internal.local/api/v1/objects",
			want:     "https",
		},
		{
			name:     "defaults to http",
			urlValue: "/api/v1/objects",
			want:     "http",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			requestURL := tc.urlValue
			if requestURL == "" {
				requestURL = "http://internal.local/api/v1/objects"
			}
			req := httptest.NewRequest(http.MethodGet, requestURL, nil)
			if tc.forwarded != "" {
				req.Header.Set("Forwarded", tc.forwarded)
			}
			if tc.xfProto != "" {
				req.Header.Set("X-Forwarded-Proto", tc.xfProto)
			}
			if tc.useTLS {
				req.TLS = &tls.ConnectionState{}
			}

			if got := requestScheme(req); got != tc.want {
				t.Fatalf("requestScheme()=%q, want %q", got, tc.want)
			}
		})
	}
}

func TestBuildDownloadProxyURL_UsesTrustedForwardedSchemeAndPreservesHostPort(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=ws`)
	req.Header.Set("X-Forwarded-Proto", "HTTPS")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != token.ProfileID {
		t.Fatalf("profileId=%q, want %q", got, token.ProfileID)
	}
	if got := parsed.Query().Get("bucket"); got != token.Bucket {
		t.Fatalf("bucket=%q, want %q", got, token.Bucket)
	}
	if got := parsed.Query().Get("key"); got != token.Key {
		t.Fatalf("key=%q, want %q", got, token.Key)
	}
	if parsed.Query().Get("sig") == "" {
		t.Fatal("sig should not be empty")
	}
}

func TestBuildDownloadProxyURL_IgnoresForwardedHostHeaders(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto="HTTPS";host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.internal:9443")
	}
}

func TestBuildDownloadProxyURL_UsesLaterForwardedProtoEntryAndStillIgnoresSpoofedHosts(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=ws;host="evil.example:8443", for=127.0.0.2;proto="HTTPS";host="still-evil.example:7443"`)
	req.Header.Set("X-Forwarded-Proto", "http")
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.internal:9443")
	}
}

func TestBuildDownloadProxyURL_IgnoresLaterXForwardedProtoEntriesAfterInvalidFirstValue(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("X-Forwarded-Proto", "ws, http")
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.internal:9443")
	}
}

func TestBuildDownloadProxyURL_UsesExternalBaseURLWhenConfigured(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "folder/report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=http`)

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.example" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example")
	}
	if parsed.Path != "/public/base/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/base/download-proxy")
	}
	if got := parsed.Query().Get("key"); got != token.Key {
		t.Fatalf("key=%q, want %q", got, token.Key)
	}
}

func TestBuildDownloadProxyURL_UsesExternalBaseURLHostPortWhenConfigured(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:8443/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "folder/report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:6553")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.example:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example:8443")
	}
	if parsed.Path != "/public/base/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/base/download-proxy")
	}
}

func TestBuildDownloadProxyURL_UsesExternalBaseURLHostPortAndPreservesMetadataHints(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:8443/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID:    "profile-1",
		Bucket:       "bucket-a",
		Key:          "folder/report.txt",
		Expires:      12345,
		Size:         42,
		ContentType:  "text/plain",
		LastModified: "2026-04-12T00:00:00Z",
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:6553")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.example:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example:8443")
	}
	if parsed.Path != "/public/base/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/base/download-proxy")
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
	if got := parsed.Query().Get("contentType"); got != "text/plain" {
		t.Fatalf("contentType=%q, want text/plain", got)
	}
	if got := parsed.Query().Get("lastModified"); got != "2026-04-12T00:00:00Z" {
		t.Fatalf("lastModified=%q, want 2026-04-12T00:00:00Z", got)
	}
}

func TestBuildDownloadProxyURL_UsesNormalizedExternalBaseURLPath(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:8443/public/base/../safe/./",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID:    "profile-1",
		Bucket:       "bucket-a",
		Key:          "folder/report.txt",
		Expires:      12345,
		Size:         42,
		ContentType:  "text/plain",
		LastModified: "2026-04-12T00:00:00Z",
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:6553")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.example:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example:8443")
	}
	if parsed.Path != "/public/safe/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/safe/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-1" {
		t.Fatalf("profileId=%q, want profile-1", got)
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
	if got := parsed.Query().Get("contentType"); got != "text/plain" {
		t.Fatalf("contentType=%q, want text/plain", got)
	}
	if got := parsed.Query().Get("lastModified"); got != "2026-04-12T00:00:00Z" {
		t.Fatalf("lastModified=%q, want 2026-04-12T00:00:00Z", got)
	}
}

func TestBuildDownloadProxyURL_UsesCanonicalExternalBaseURLHostAndPort(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://Downloads.EXAMPLE.:8443/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "folder/report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Host != "downloads.example:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example:8443")
	}
	if parsed.Path != "/public/base/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/base/download-proxy")
	}
}

func TestBuildDownloadProxyURL_UsesCanonicalIPv6ExternalBaseURLHostAndPort(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://[FD00::1234]:8443/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID: "profile-1",
		Bucket:    "bucket-a",
		Key:       "folder/report.txt",
		Expires:   12345,
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:6553")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "[fd00::1234]:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "[fd00::1234]:8443")
	}
	if parsed.Path != "/public/base/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/base/download-proxy")
	}
}

func TestBuildDownloadProxyURL_ExternalBaseURLReplacesBaseQueryAndClearsFragment(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:8443/public/base/?from=external#stale-fragment",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID:    "profile-1",
		Bucket:       "bucket-a",
		Key:          "folder/report.txt",
		Expires:      12345,
		Size:         42,
		ContentType:  "text/plain",
		LastModified: "2026-04-12T00:00:00Z",
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:6553")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.example:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example:8443")
	}
	if parsed.Path != "/public/base/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/base/download-proxy")
	}
	if got := parsed.Query().Get("from"); got != "" {
		t.Fatalf("from=%q, want empty", got)
	}
	if got := parsed.Query().Get("profileId"); got != "profile-1" {
		t.Fatalf("profileId=%q, want profile-1", got)
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
	if parsed.Fragment != "" {
		t.Fatalf("fragment=%q, want empty", parsed.Fragment)
	}
}

func TestBuildDownloadProxyURL_FallsBackWhenExternalBaseURLUnsupported(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "javascript://downloads.example/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID:    "profile-1",
		Bucket:       "bucket-a",
		Key:          "folder/report.txt",
		Expires:      12345,
		Size:         42,
		ContentType:  "text/plain",
		LastModified: "2026-04-12T00:00:00Z",
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=ws;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Proto", "HTTPS")
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:6553")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
	if got := parsed.Query().Get("contentType"); got != "text/plain" {
		t.Fatalf("contentType=%q, want text/plain", got)
	}
	if got := parsed.Query().Get("lastModified"); got != "2026-04-12T00:00:00Z" {
		t.Fatalf("lastModified=%q, want 2026-04-12T00:00:00Z", got)
	}
}

func TestBuildDownloadProxyURL_FallsBackWhenExternalBaseURLIncludesUserinfo(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://user:pass@downloads.example:8443/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID:    "profile-1",
		Bucket:       "bucket-a",
		Key:          "folder/report.txt",
		Expires:      12345,
		Size:         42,
		ContentType:  "text/plain",
		LastModified: "2026-04-12T00:00:00Z",
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:7443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:6553")

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.User != nil {
		t.Fatalf("userinfo=%v, want nil", parsed.User)
	}
	if parsed.Host != "downloads.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-1" {
		t.Fatalf("profileId=%q, want profile-1", got)
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
	if got := parsed.Query().Get("contentType"); got != "text/plain" {
		t.Fatalf("contentType=%q, want text/plain", got)
	}
	if got := parsed.Query().Get("lastModified"); got != "2026-04-12T00:00:00Z" {
		t.Fatalf("lastModified=%q, want 2026-04-12T00:00:00Z", got)
	}
	if parsed.Query().Get("sig") == "" {
		t.Fatal("sig should not be empty")
	}
}

func TestBuildDownloadProxyURL_FallsBackWhenExternalBaseURLHasInvalidPort(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:bad/public/base/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	token := downloadProxyToken{
		ProfileID:    "profile-1",
		Bucket:       "bucket-a",
		Key:          "folder/report.txt",
		Expires:      12345,
		Size:         42,
		ContentType:  "text/plain",
		LastModified: "2026-04-12T00:00:00Z",
	}
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/v1/objects", nil)
	req.Host = "downloads.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:7443"`)

	raw := srv.buildDownloadProxyURL(req, token)
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}

	if parsed.Host != "downloads.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
}

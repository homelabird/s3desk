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

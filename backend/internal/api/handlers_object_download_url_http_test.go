package api

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectDownloadURLHTTPService_HandleGetObjectDownloadURL_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/download-url?key=report.txt", nil)
	req = withBucketParam(req, "test-bucket")
	rr := httptest.NewRecorder()

	newObjectDownloadURLHTTPService(srv).handleGetObjectDownloadURL(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
}

func TestObjectDownloadURLHTTPService_HandleGetObjectDownloadURL_ProxyRequiresProfileHeader(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1", nil)
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	rr := httptest.NewRecorder()

	newObjectDownloadURLHTTPService(srv).handleGetObjectDownloadURL(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
}

func TestBuildObjectDownloadURLResponse_SetsExpiresAt(t *testing.T) {
	now := time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC)
	resp := buildObjectDownloadURLResponse("https://example.invalid/object", 15*time.Minute, now)
	if resp.URL != "https://example.invalid/object" {
		t.Fatalf("url=%q, want example url", resp.URL)
	}
	if resp.ExpiresAt != "2026-04-12T00:15:00Z" {
		t.Fatalf("expiresAt=%q, want 2026-04-12T00:15:00Z", resp.ExpiresAt)
	}
}

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyUsesExternalBaseURLAndIgnoresForwardedHost(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example/public/root/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=http;host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-1",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.example" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example")
	}
	if parsed.Path != "/public/root/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/root/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-1" {
		t.Fatalf("profileId=%q, want profile-1", got)
	}
	if got := parsed.Query().Get("bucket"); got != "test-bucket" {
		t.Fatalf("bucket=%q, want test-bucket", got)
	}
	if got := parsed.Query().Get("key"); got != "report.txt" {
		t.Fatalf("key=%q, want report.txt", got)
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

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyUsesRequestHostPortAndSecretProfileID(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto="HTTPS";host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "api.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "api.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
	}
}

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyUsesForwardedProtoFallbackAndPreservesMetadataHints(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=ws;host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Proto", "HTTPS")
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "api.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "api.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
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

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyUsesLaterForwardedProtoEntryAndIgnoresSpoofedHosts(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=ws;host="evil.example:8443", for=127.0.0.2;proto="HTTPS";host="still-evil.example:7443"`)
	req.Header.Set("X-Forwarded-Proto", "http")
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "api.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "api.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
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

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyIgnoresLaterXForwardedProtoEntriesAfterInvalidFirstValue(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg:         config.Config{DataDir: t.TempDir()},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("X-Forwarded-Proto", "ws, http")
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "api.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "api.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
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

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyUsesNormalizedExternalBaseURLPath(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:8443/public/root/../safe/./",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=http;host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
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
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
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

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyUsesCanonicalExternalBaseURLHostAndPort(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://Downloads.EXAMPLE.:8443/public/root/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1",
		nil,
	)
	req.Host = "api.internal:9443"
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Host != "downloads.example:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example:8443")
	}
	if parsed.Path != "/public/root/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/root/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
	}
}

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyUsesCanonicalIPv6ExternalBaseURLHostAndPort(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://[FD00::1234]:8443/public/root/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1",
		nil,
	)
	req.Host = "api.internal:9443"
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Host != "[fd00::1234]:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "[fd00::1234]:8443")
	}
	if parsed.Path != "/public/root/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/root/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
	}
}

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyExternalBaseURLReplacesBaseQueryAndClearsFragment(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:8443/public/root/?from=external#stale-fragment",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=http;host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "downloads.example:8443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "downloads.example:8443")
	}
	if parsed.Path != "/public/root/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/public/root/download-proxy")
	}
	if got := parsed.Query().Get("from"); got != "" {
		t.Fatalf("from=%q, want empty", got)
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
	if got := parsed.Query().Get("contentType"); got != "text/plain" {
		t.Fatalf("contentType=%q, want text/plain", got)
	}
	if parsed.Fragment != "" {
		t.Fatalf("fragment=%q, want empty", parsed.Fragment)
	}
}

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyFallsBackWhenExternalBaseURLUnsupported(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "javascript://downloads.example/public/root/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=ws;host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Proto", "HTTPS")
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.Host != "api.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "api.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
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

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyFallsBackWhenExternalBaseURLIncludesUserinfo(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://user:pass@downloads.example:8443/public/root/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:8443"`)
	req.Header.Set("X-Forwarded-Host", "spoofed.invalid:7443")
	req.Header.Set("X-Profile-Id", "spoofed-profile")
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Scheme != "https" {
		t.Fatalf("scheme=%q, want https", parsed.Scheme)
	}
	if parsed.User != nil {
		t.Fatalf("userinfo=%v, want nil", parsed.User)
	}
	if parsed.Host != "api.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "api.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
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

func TestObjectDownloadURLHTTPService_ExecuteGet_ProxyFallsBackWhenExternalBaseURLHasInvalidPort(t *testing.T) {
	t.Parallel()

	srv := &server{
		cfg: config.Config{
			DataDir:         t.TempDir(),
			ExternalBaseURL: "https://downloads.example:bad/public/root/",
		},
		proxySecret: resolveProxySecret("proxy-test-token"),
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/download-url?key=report.txt&proxy=1&size=42&contentType=text/plain&lastModified=2026-04-12T00:00:00Z",
		nil,
	)
	req.Host = "api.internal:9443"
	req.Header.Set("Forwarded", `for=127.0.0.1;proto=https;host="evil.example:8443"`)
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{
		ID:       "profile-from-secret",
		Provider: models.ProfileProviderAwsS3,
	})

	metric := srv.beginStorageMetric("unknown", "get_download_url")
	resp, rcloneErr, _, _, _, err := newObjectDownloadURLHTTPService(srv).executeGet(metric, req)
	if err != nil {
		t.Fatalf("executeGet error: %v", err)
	}
	if rcloneErr != nil {
		t.Fatalf("executeGet rcloneErr: %v", rcloneErr)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	parsed, parseErr := url.Parse(resp.URL)
	if parseErr != nil {
		t.Fatalf("parse url: %v", parseErr)
	}
	if parsed.Host != "api.internal:9443" {
		t.Fatalf("host=%q, want %q", parsed.Host, "api.internal:9443")
	}
	if parsed.Path != "/download-proxy" {
		t.Fatalf("path=%q, want %q", parsed.Path, "/download-proxy")
	}
	if got := parsed.Query().Get("profileId"); got != "profile-from-secret" {
		t.Fatalf("profileId=%q, want profile-from-secret", got)
	}
	if got := parsed.Query().Get("size"); got != "42" {
		t.Fatalf("size=%q, want 42", got)
	}
}

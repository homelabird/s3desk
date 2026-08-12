package rcloneegress

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"s3desk/internal/profileendpoint"
)

func TestProxyForwardsHTTPThroughGuardedDial(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, r.Host)
	}))
	t.Cleanup(upstream.Close)
	upstreamURL, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("parse upstream URL: %v", err)
	}

	proxy, err := Start(context.Background(), false)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = proxy.Close() })

	client := proxyClient(t, proxy.URL())
	resp, err := client.Get(upstream.URL + "/object")
	if err != nil {
		t.Fatalf("GET through proxy: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	if got := string(body); got != upstreamURL.Host {
		t.Fatalf("upstream host=%q, want %q", got, upstreamURL.Host)
	}
}

func TestProxyForwardsHTTPSConnect(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "connected")
	}))
	t.Cleanup(upstream.Close)

	proxy, err := Start(context.Background(), false)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = proxy.Close() })

	client := upstream.Client()
	transport := client.Transport.(*http.Transport)
	proxyURL, err := url.Parse(proxy.URL())
	if err != nil {
		t.Fatalf("parse proxy URL: %v", err)
	}
	transport.Proxy = http.ProxyURL(proxyURL)

	resp, err := client.Get(upstream.URL + "/object")
	if err != nil {
		t.Fatalf("GET through CONNECT proxy: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	if got := string(body); got != "connected" {
		t.Fatalf("response=%q, want connected", got)
	}
}

func TestProxyGuardsDNSAtActualDial(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "must not reach")
	}))
	t.Cleanup(upstream.Close)

	var lookupCount atomic.Int32
	restore := profileendpoint.SetLookupHooksForTest(
		func(context.Context, string) (string, error) {
			return "", errNoCNAME
		},
		func(context.Context, string) ([]net.IPAddr, error) {
			if lookupCount.Add(1) == 1 {
				return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
			}
			return []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}, nil
		},
	)
	t.Cleanup(restore)

	proxy, err := Start(context.Background(), false)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = proxy.Close() })

	target, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("parse upstream URL: %v", err)
	}
	target.Host = "rebind.test:" + strings.TrimPrefix(target.Host, "127.0.0.1:")
	resp, err := proxyClient(t, proxy.URL()).Get(target.String())
	if err != nil {
		t.Fatalf("GET through proxy: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("status=%d, want %d", resp.StatusCode, http.StatusBadGateway)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "blocked metadata host") {
		t.Fatalf("proxy error=%q, want guarded metadata error", body)
	}
}

func TestProxyEnvironmentOverridesBypassVariables(t *testing.T) {
	proxy, err := Start(context.Background(), false)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = proxy.Close() })

	env := proxy.Environment([]string{
		"HTTP_PROXY=http://old",
		"NO_PROXY=metadata.internal",
		"other=value",
	})
	seen := map[string]string{}
	for _, entry := range env {
		key, value, ok := strings.Cut(entry, "=")
		if ok {
			seen[key] = value
		}
	}
	if seen["HTTP_PROXY"] != proxy.URL() || seen["HTTPS_PROXY"] != proxy.URL() {
		t.Fatalf("proxy environment=%v", seen)
	}
	if seen["NO_PROXY"] != "" || seen["no_proxy"] != "" {
		t.Fatalf("bypass environment=%v", seen)
	}
	if seen["other"] != "value" {
		t.Fatalf("unrelated environment=%v", seen)
	}
}

func TestProxyRejectsUnauthenticatedRequest(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "must not reach")
	}))
	t.Cleanup(upstream.Close)

	proxy, err := Start(context.Background(), false)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = proxy.Close() })

	proxyURL, err := url.Parse(proxy.URL())
	if err != nil {
		t.Fatalf("parse proxy URL: %v", err)
	}
	proxyURL.User = nil
	resp, err := proxyClient(t, proxyURL.String()).Get(upstream.URL)
	if err != nil {
		t.Fatalf("GET through unauthenticated proxy: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusProxyAuthRequired {
		t.Fatalf("status=%d, want %d", resp.StatusCode, http.StatusProxyAuthRequired)
	}
}

func proxyClient(t *testing.T, rawURL string) *http.Client {
	t.Helper()
	proxyURL, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse proxy URL: %v", err)
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = http.ProxyURL(proxyURL)
	t.Cleanup(transport.CloseIdleConnections)
	return &http.Client{Transport: transport}
}

var errNoCNAME = errors.New("no cname")

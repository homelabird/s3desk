package profileendpoint

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateRequestURLAllowsQueryString(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:9000/bucket?policy", nil)
	if err := ValidateRequestURL("request URL", req.URL, false); err != nil {
		t.Fatalf("ValidateRequestURL() unexpected error: %v", err)
	}
}

func TestValidateRequestURLRejectsMetadataHost(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "http://169.254.169.254/latest/meta-data?policy", nil)
	err := ValidateRequestURL("request URL", req.URL, false)
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("ValidateRequestURL() error=%v, want blocked metadata host", err)
	}
}

func TestGuardedDialContextRejectsMetadataAddressBeforeDial(t *testing.T) {
	t.Parallel()

	dial := GuardedDialContext(false)
	_, err := dial(context.Background(), "tcp", "169.254.169.254:80")
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("GuardedDialContext() error=%v, want blocked metadata host", err)
	}
}

func TestGuardedDialContextRejectsResolvedMetadataAddressBeforeDial(t *testing.T) {
	restore := SetLookupHooksForTest(
		func(context.Context, string) (string, error) {
			return "", errors.New("no cname")
		},
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "metadata-alias.internal" {
				t.Fatalf("LookupIPAddr host=%q, want metadata-alias.internal", host)
			}
			return []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}, nil
		},
	)
	t.Cleanup(restore)

	dial := GuardedDialContext(false)
	_, err := dial(context.Background(), "tcp", "metadata-alias.internal:80")
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("GuardedDialContext() error=%v, want blocked metadata host", err)
	}
}

func TestGuardedDialContextRejectsMetadataCNAMEBeforeDial(t *testing.T) {
	restore := SetLookupHooksForTest(
		func(_ context.Context, host string) (string, error) {
			if host != "metadata-cname.internal" {
				t.Fatalf("LookupCNAME host=%q, want metadata-cname.internal", host)
			}
			return "metadata.google.internal.", nil
		},
		func(context.Context, string) ([]net.IPAddr, error) {
			t.Fatal("LookupIPAddr should not be called after blocked CNAME")
			return nil, nil
		},
	)
	t.Cleanup(restore)

	dial := GuardedDialContext(false)
	_, err := dial(context.Background(), "tcp", "metadata-cname.internal:80")
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("GuardedDialContext() error=%v, want blocked metadata host", err)
	}
}

func TestGuardedDialContextRejectsLocalhostCNAMEWhenRemoteEnabled(t *testing.T) {
	tests := []struct {
		name      string
		host      string
		canonical string
	}{
		{
			name:      "localhost",
			host:      "localhost-cname.internal",
			canonical: "localhost.",
		},
		{
			name:      "localhost subdomain",
			host:      "localhost-subdomain-cname.internal",
			canonical: "storage.localhost.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			restore := SetLookupHooksForTest(
				func(_ context.Context, host string) (string, error) {
					if host != tt.host {
						t.Fatalf("LookupCNAME host=%q, want %q", host, tt.host)
					}
					return tt.canonical, nil
				},
				func(context.Context, string) ([]net.IPAddr, error) {
					t.Fatal("LookupIPAddr should not be called after blocked localhost CNAME")
					return nil, nil
				},
			)
			t.Cleanup(restore)

			dial := GuardedDialContext(true)
			_, err := dial(context.Background(), "tcp", net.JoinHostPort(tt.host, "80"))
			if err == nil || !strings.Contains(err.Error(), "must not target localhost") {
				t.Fatalf("GuardedDialContext() error=%v, want localhost CNAME rejection", err)
			}
		})
	}
}

func TestGuardedDialContextRejectsResolvedLoopbackOrLinkLocalWhenRemoteEnabled(t *testing.T) {
	tests := []struct {
		name string
		host string
		ip   string
	}{
		{
			name: "loopback",
			host: "loopback-alias.internal",
			ip:   "127.0.0.1",
		},
		{
			name: "ipv6 loopback",
			host: "ipv6-loopback-alias.internal",
			ip:   "::1",
		},
		{
			name: "link local",
			host: "link-local-alias.internal",
			ip:   "169.254.10.20",
		},
		{
			name: "ipv6 link local",
			host: "ipv6-link-local-alias.internal",
			ip:   "fe80::1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			restore := SetLookupHooksForTest(
				func(context.Context, string) (string, error) {
					return "", errors.New("no cname")
				},
				func(_ context.Context, host string) ([]net.IPAddr, error) {
					if host != tt.host {
						t.Fatalf("LookupIPAddr host=%q, want %q", host, tt.host)
					}
					return []net.IPAddr{{IP: net.ParseIP(tt.ip)}}, nil
				},
			)
			t.Cleanup(restore)

			dial := GuardedDialContext(true)
			_, err := dial(context.Background(), "tcp", net.JoinHostPort(tt.host, "80"))
			if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
				t.Fatalf("GuardedDialContext() error=%v, want loopback/link-local rejection", err)
			}
		})
	}
}

func TestNewHTTPClientRejectsRedirectToMetadataHost(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	client := NewHTTPClient(HTTPClientOptions{})
	resp, err := client.Get(srv.URL)
	if resp != nil {
		_ = resp.Body.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("client.Get() error=%v, want blocked metadata host", err)
	}
}

func TestNewHTTPClientRejectsRedirectToMetadataCNAME(t *testing.T) {
	restore := SetLookupHooksForTest(
		func(_ context.Context, host string) (string, error) {
			if host != "metadata-cname.internal" {
				t.Fatalf("LookupCNAME host=%q, want metadata-cname.internal", host)
			}
			return "instance-data.ec2.internal.", nil
		},
		func(context.Context, string) ([]net.IPAddr, error) {
			t.Fatal("LookupIPAddr should not be called after blocked CNAME")
			return nil, nil
		},
	)
	t.Cleanup(restore)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://metadata-cname.internal/latest/meta-data", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	client := NewHTTPClient(HTTPClientOptions{})
	resp, err := client.Get(srv.URL)
	if resp != nil {
		_ = resp.Body.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("client.Get() error=%v, want blocked metadata host", err)
	}
}

func TestNewHTTPClientRejectsRedirectToResolvedLoopbackOrLinkLocalWhenRemoteEnabled(t *testing.T) {
	tests := []struct {
		name string
		host string
		ip   string
	}{
		{
			name: "loopback",
			host: "loopback-alias.internal",
			ip:   "127.0.0.1",
		},
		{
			name: "ipv6 loopback",
			host: "ipv6-loopback-alias.internal",
			ip:   "::1",
		},
		{
			name: "link local",
			host: "link-local-alias.internal",
			ip:   "169.254.10.20",
		},
		{
			name: "ipv6 link local",
			host: "ipv6-link-local-alias.internal",
			ip:   "fe80::1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			restore := SetLookupHooksForTest(
				func(context.Context, string) (string, error) {
					return "", errors.New("no cname")
				},
				func(_ context.Context, host string) ([]net.IPAddr, error) {
					if host != tt.host {
						t.Fatalf("LookupIPAddr host=%q, want %q", host, tt.host)
					}
					return []net.IPAddr{{IP: net.ParseIP(tt.ip)}}, nil
				},
			)
			t.Cleanup(restore)

			req := httptest.NewRequest(http.MethodGet, "http://"+tt.host+"/redirect-target", nil)
			client := NewHTTPClient(HTTPClientOptions{AllowRemote: true})
			err := client.CheckRedirect(req, nil)
			if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
				t.Fatalf("CheckRedirect() error=%v, want loopback/link-local rejection", err)
			}
		})
	}
}

func TestNewHTTPClientRejectsRedirectToLocalhostCNAMEWhenRemoteEnabled(t *testing.T) {
	tests := []struct {
		name      string
		host      string
		canonical string
	}{
		{
			name:      "localhost",
			host:      "localhost-cname.internal",
			canonical: "localhost.",
		},
		{
			name:      "localhost subdomain",
			host:      "localhost-subdomain-cname.internal",
			canonical: "storage.localhost.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			restore := SetLookupHooksForTest(
				func(_ context.Context, host string) (string, error) {
					if host != tt.host {
						t.Fatalf("LookupCNAME host=%q, want %q", host, tt.host)
					}
					return tt.canonical, nil
				},
				func(context.Context, string) ([]net.IPAddr, error) {
					t.Fatal("LookupIPAddr should not be called after blocked localhost CNAME")
					return nil, nil
				},
			)
			t.Cleanup(restore)

			req := httptest.NewRequest(http.MethodGet, "http://"+tt.host+"/redirect-target", nil)
			client := NewHTTPClient(HTTPClientOptions{AllowRemote: true})
			err := client.CheckRedirect(req, nil)
			if err == nil || !strings.Contains(err.Error(), "must not target localhost") {
				t.Fatalf("CheckRedirect() error=%v, want localhost CNAME rejection", err)
			}
		})
	}
}

func TestNewHTTPClientRejectsRedirectToResolvedMetadataAddress(t *testing.T) {
	restore := SetLookupHooksForTest(
		func(context.Context, string) (string, error) {
			return "", errors.New("no cname")
		},
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "metadata-alias.internal" {
				t.Fatalf("LookupIPAddr host=%q, want metadata-alias.internal", host)
			}
			return []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}, nil
		},
	)
	t.Cleanup(restore)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://metadata-alias.internal/latest/meta-data", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	client := NewHTTPClient(HTTPClientOptions{})
	resp, err := client.Get(srv.URL)
	if resp != nil {
		_ = resp.Body.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("client.Get() error=%v, want blocked metadata host", err)
	}
}

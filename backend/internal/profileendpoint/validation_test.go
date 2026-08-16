package profileendpoint

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
)

func TestValidateURLRejectsLocalhostCNAMEWhenRemoteEnabled(t *testing.T) {
	restore := SetLookupHooksForTest(
		func(_ context.Context, host string) (string, error) {
			if host != "localhost-cname.internal" {
				t.Fatalf("LookupCNAME host=%q, want localhost-cname.internal", host)
			}
			return "storage.localhost.", nil
		},
		func(context.Context, string) ([]net.IPAddr, error) {
			t.Fatal("LookupIPAddr should not be called after blocked localhost CNAME")
			return nil, nil
		},
	)
	t.Cleanup(restore)

	endpoint := "https://localhost-cname.internal"
	err := ValidateURL("endpoint", &endpoint, true)
	if err == nil || !strings.Contains(err.Error(), "must not target localhost") {
		t.Fatalf("ValidateURL() error=%v, want localhost CNAME rejection", err)
	}
}

func TestResolveHostPinsValidatedAddress(t *testing.T) {
	lookups := 0
	restore := SetLookupHooksForTest(
		func(context.Context, string) (string, error) { return "", errors.New("no cname") },
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			lookups++
			if host != "ftp.example.test" {
				t.Fatalf("host=%q, want ftp.example.test", host)
			}
			return []net.IPAddr{{IP: net.ParseIP("192.0.2.10")}}, nil
		},
	)
	t.Cleanup(restore)

	got, err := ResolveHost("FTP host", "ftp.example.test", false)
	if err != nil || got != "192.0.2.10" || lookups != 1 {
		t.Fatalf("ResolveHost()=(%q, %v), lookups=%d; want (192.0.2.10, nil), 1 lookup", got, err, lookups)
	}
}

func TestValidateURLRejectsResolvedIPv6LoopbackOrLinkLocalWhenRemoteEnabled(t *testing.T) {
	tests := []struct {
		name string
		host string
		ip   string
	}{
		{
			name: "ipv6 loopback",
			host: "ipv6-loopback.internal",
			ip:   "::1",
		},
		{
			name: "ipv6 link local",
			host: "ipv6-link-local.internal",
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

			endpoint := "https://" + tt.host
			err := ValidateURL("endpoint", &endpoint, true)
			if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
				t.Fatalf("ValidateURL() error=%v, want loopback/link-local rejection", err)
			}
		})
	}
}

func TestValidateTLSSkipVerifyEndpointIPv6ResolvedHosts(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		ip      string
		wantErr string
	}{
		{
			name: "allows private ula",
			host: "minio-ipv6.internal",
			ip:   "fd00::25",
		},
		{
			name:    "rejects public ipv6",
			host:    "public-ipv6.example.com",
			ip:      "2001:4860:4860::8888",
			wantErr: "allowed only for private",
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

			endpoint := "https://" + tt.host
			err := ValidateTLSSkipVerifyEndpoint("endpoint", &endpoint, false)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateTLSSkipVerifyEndpoint() unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("ValidateTLSSkipVerifyEndpoint() error=%v, want %q", err, tt.wantErr)
			}
		})
	}
}

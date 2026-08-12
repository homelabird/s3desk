package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
)

func TestParseTrustedOrigin_StrictOriginForm(t *testing.T) {
	cases := []struct {
		name    string
		origin  string
		wantErr bool
	}{
		{
			name:   "plain origin allowed",
			origin: "https://localhost:5173",
		},
		{
			name:    "origin with trailing slash rejected",
			origin:  "https://localhost:5173/",
			wantErr: true,
		},
		{
			name:    "origin with path rejected",
			origin:  "https://localhost:5173/app",
			wantErr: true,
		},
		{
			name:    "origin with query rejected",
			origin:  "https://localhost:5173?from=app",
			wantErr: true,
		},
		{
			name:    "origin with fragment rejected",
			origin:  "https://localhost:5173#stale-fragment",
			wantErr: true,
		},
		{
			name:    "origin with userinfo rejected",
			origin:  "https://user@localhost:5173",
			wantErr: true,
		},
		{
			name:    "origin with empty host rejected",
			origin:  "https://:5173",
			wantErr: true,
		},
		{
			name:    "origin with out of range port rejected",
			origin:  "https://localhost:65536",
			wantErr: true,
		},
		{
			name:    "null origin rejected",
			origin:  "null",
			wantErr: true,
		},
		{
			name:    "file origin rejected",
			origin:  "file://localhost",
			wantErr: true,
		},
		{
			name:    "unsupported scheme origin rejected",
			origin:  "wss://localhost:8080",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			parsed, err := parseTrustedOrigin(tc.origin)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("parseTrustedOrigin(%q) succeeded, want error", tc.origin)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseTrustedOrigin(%q) error: %v", tc.origin, err)
			}
			if parsed == nil {
				t.Fatalf("parseTrustedOrigin(%q) returned nil URL", tc.origin)
			}
		})
	}
}

func TestIsAllowedRealtimeOrigin_PolicyMatrix(t *testing.T) {
	cases := []struct {
		name   string
		cfg    config.Config
		origin string
		want   bool
	}{
		{
			name:   "localhost allowed by default",
			origin: "http://localhost:5173",
			want:   true,
		},
		{
			name:   "https localhost allowed by default",
			origin: "https://localhost:5443",
			want:   true,
		},
		{
			name:   "uppercase https localhost allowed by default",
			origin: "HTTPS://LOCALHOST:5443",
			want:   true,
		},
		{
			name:   "ipv6 localhost allowed by default",
			origin: "http://[::1]:5173",
			want:   true,
		},
		{
			name:   "private origin rejected by default",
			origin: "http://10.1.2.3:8080",
			want:   false,
		},
		{
			name:   "allow remote accepts private origin",
			cfg:    config.Config{AllowRemote: true},
			origin: "http://10.1.2.3:8080",
			want:   true,
		},
		{
			name:   "allow remote accepts ipv6 ula origin",
			cfg:    config.Config{AllowRemote: true},
			origin: "http://[fd00::25]:8080",
			want:   true,
		},
		{
			name:   "allowlist accepts ipv6 ula origin with mixed case brackets",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"fd00::25"}},
			origin: "https://[FD00::25]:8443",
			want:   true,
		},
		{
			name:   "allowlist accepts explicit host",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "http://s3desk.local:8080",
			want:   true,
		},
		{
			name:   "allowlist accepts mixed case host with trailing dot",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "https://S3DESK.LOCAL.:8443",
			want:   true,
		},
		{
			name:   "out of range localhost port rejected",
			origin: "https://localhost:65536",
			want:   false,
		},
		{
			name:   "allowlist rejects non listed private host",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "http://172.18.34.4:8080",
			want:   false,
		},
		{
			name:   "allowlist rejects non listed ipv6 ula origin",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"fd00::25"}},
			origin: "http://[fd00::26]:8080",
			want:   false,
		},
		{
			name:   "public host rejected even when allow remote is enabled",
			cfg:    config.Config{AllowRemote: true},
			origin: "http://example.com",
			want:   false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{cfg: tc.cfg}
			if got := s.isAllowedRealtimeOrigin(tc.origin); got != tc.want {
				t.Fatalf("isAllowedRealtimeOrigin(%q)=%v, want %v", tc.origin, got, tc.want)
			}
		})
	}
}

func TestCheckWebSocketOrigin_UsesRealtimeOriginPolicy(t *testing.T) {
	cases := []struct {
		name   string
		cfg    config.Config
		origin string
		want   bool
	}{
		{
			name:   "localhost origin allowed by default",
			origin: "http://127.0.0.1:8080",
			want:   true,
		},
		{
			name:   "allowlisted mixed case host origin allowed",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "https://S3DESK.LOCAL.:8443",
			want:   true,
		},
		{
			name:   "allowlisted ipv6 ula origin allowed",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"fd00::25"}},
			origin: "https://[FD00::25]:8443",
			want:   true,
		},
		{
			name: "missing origin rejected",
			want: false,
		},
		{
			name:   "null origin rejected",
			origin: "null",
			want:   false,
		},
		{
			name:   "origin with trailing slash rejected",
			origin: "https://localhost:8080/",
			want:   false,
		},
		{
			name:   "origin with query rejected",
			origin: "https://localhost:8080?from=app",
			want:   false,
		},
		{
			name:   "origin with fragment rejected",
			origin: "https://localhost:8080#stale-fragment",
			want:   false,
		},
		{
			name:   "origin with userinfo rejected",
			origin: "https://user@localhost:8080",
			want:   false,
		},
		{
			name:   "origin with empty host rejected",
			origin: "https://:5173",
			want:   false,
		},
		{
			name:   "file origin rejected",
			origin: "file://localhost",
			want:   false,
		},
		{
			name:   "unsupported scheme origin rejected",
			origin: "wss://localhost:8080",
			want:   false,
		},
		{
			name:   "origin with out of range port rejected",
			origin: "https://localhost:65536",
			want:   false,
		},
		{
			name:   "origin with path rejected",
			origin: "http://127.0.0.1:8080/app",
			want:   false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{cfg: tc.cfg}
			req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/ws", nil)
			req.Header.Set("Origin", tc.origin)

			if got := s.checkWebSocketOrigin(req); got != tc.want {
				t.Fatalf("checkWebSocketOrigin(%q)=%v, want %v", tc.origin, got, tc.want)
			}
		})
	}
}

func TestRejectInvalidRealtimeOrigin_Table(t *testing.T) {
	cases := []struct {
		name             string
		cfg              config.Config
		origin           string
		fetchSite        string
		wantRejected     bool
		wantStatus       int
		wantBodyContains string
	}{
		{
			name:             "missing origin rejected",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:         "same-origin fetch metadata without origin allowed",
			fetchSite:    "same-origin",
			wantRejected: false,
		},
		{
			name:         "localhost origin allowed",
			origin:       "http://127.0.0.1:8080",
			wantRejected: false,
		},
		{
			name:         "ipv6 localhost origin allowed",
			origin:       "http://[::1]:8080",
			wantRejected: false,
		},
		{
			name:         "https localhost origin allowed",
			origin:       "https://localhost:8443",
			wantRejected: false,
		},
		{
			name:         "uppercase https localhost origin allowed",
			origin:       "HTTPS://LOCALHOST:8443",
			wantRejected: false,
		},
		{
			name:         "allow remote ipv6 ula origin allowed",
			cfg:          config.Config{AllowRemote: true},
			origin:       "http://[fd00::25]:8080",
			wantRejected: false,
		},
		{
			name:         "allowlisted ipv6 ula origin allowed",
			cfg:          config.Config{AllowRemote: true, AllowedHosts: []string{"fd00::25"}},
			origin:       "https://[FD00::25]:8443",
			wantRejected: false,
		},
		{
			name:         "allowlisted remote origin allowed",
			cfg:          config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin:       "http://s3desk.local:8080",
			wantRejected: false,
		},
		{
			name:         "allowlisted mixed case origin allowed",
			cfg:          config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin:       "https://S3DESK.LOCAL.:8443",
			wantRejected: false,
		},
		{
			name:             "non allowlisted remote origin rejected",
			cfg:              config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin:           "http://172.18.34.4:8080",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "non allowlisted ipv6 ula origin rejected",
			cfg:              config.Config{AllowRemote: true, AllowedHosts: []string{"fd00::25"}},
			origin:           "http://[fd00::26]:8080",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "localhost origin with path rejected",
			origin:           "http://localhost:5173/app",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "localhost origin with trailing slash rejected",
			origin:           "https://localhost:5173/",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "localhost origin with query rejected",
			origin:           "https://localhost:5173?from=app",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "localhost origin with fragment rejected",
			origin:           "https://localhost:5173#stale-fragment",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "localhost origin with out of range port rejected",
			origin:           "https://localhost:65536",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "null origin rejected",
			origin:           "null",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "localhost origin with userinfo rejected",
			origin:           "https://user@localhost:5173",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "localhost origin with empty host rejected",
			origin:           "https://:5173",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "file origin rejected",
			origin:           "file://localhost",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "unsupported scheme origin rejected",
			origin:           "wss://localhost:8080",
			wantRejected:     true,
			wantStatus:       http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{cfg: tc.cfg}
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if tc.fetchSite != "" {
				req.Header.Set("Sec-Fetch-Site", tc.fetchSite)
			}

			rejected := s.rejectInvalidRealtimeOrigin(rr, req, "trusted Origin required for realtime requests")
			if rejected != tc.wantRejected {
				t.Fatalf("rejected=%v, want %v", rejected, tc.wantRejected)
			}
			if !tc.wantRejected {
				if rr.Code != http.StatusOK {
					t.Fatalf("status=%d, want %d", rr.Code, http.StatusOK)
				}
				return
			}
			if rr.Code != tc.wantStatus {
				t.Fatalf("status=%d, want %d", rr.Code, tc.wantStatus)
			}
			if !strings.Contains(rr.Body.String(), tc.wantBodyContains) {
				t.Fatalf("body=%q, want to contain %q", rr.Body.String(), tc.wantBodyContains)
			}
		})
	}
}

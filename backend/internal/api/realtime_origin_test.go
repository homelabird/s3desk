package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
)

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
			name:   "allowlist rejects non listed private host",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "http://172.18.34.4:8080",
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

func TestRejectInvalidRealtimeOrigin_Table(t *testing.T) {
	cases := []struct {
		name             string
		cfg              config.Config
		origin           string
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
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{cfg: tc.cfg}
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
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

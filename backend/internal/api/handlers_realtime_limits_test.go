package api

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/ws"
)

func TestRealtimeTransportOriginAndLimitPolicy(t *testing.T) {
	cases := []struct {
		name             string
		cfg              config.Config
		method           string
		path             string
		origin           string
		withLimit        bool
		wantCode         int
		wantRetryAfter   string
		wantBodyContains string
		wantRateLimit    bool
	}{
		{
			name:             "sse limit with trusted origin",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "http://127.0.0.1:8080",
			withLimit:        true,
			wantCode:         http.StatusTooManyRequests,
			wantRetryAfter:   "2",
			wantBodyContains: "rate_limited",
			wantRateLimit:    true,
		},
		{
			name:             "sse missing origin",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse mismatched origin host",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "http://example.com",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse null origin",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "null",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse origin with path",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "http://127.0.0.1:8080/app",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse origin with trailing slash",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "https://localhost:8080/",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse origin with query",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "https://localhost:8080?from=app",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse origin with fragment",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "https://localhost:8080#stale-fragment",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse origin with userinfo",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "https://user@localhost:8080",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse origin with empty host",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "https://:5173",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse file origin",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "file://localhost",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse unsupported scheme origin",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "wss://localhost:8080",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "sse origin with out of range port",
			method:           http.MethodGet,
			path:             "/api/v1/events",
			origin:           "https://localhost:65536",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws limit with trusted origin",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "http://127.0.0.1:8080",
			withLimit:        true,
			wantCode:         http.StatusTooManyRequests,
			wantRetryAfter:   "2",
			wantBodyContains: "too many concurrent realtime connections",
		},
		{
			name:             "ws missing origin",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws mismatched origin host",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "http://example.com",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws null origin",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "null",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws origin with path",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "http://127.0.0.1:8080/app",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws origin with trailing slash",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "https://localhost:8080/",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws origin with query",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "https://localhost:8080?from=app",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws origin with fragment",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "https://localhost:8080#stale-fragment",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws origin with userinfo",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "https://user@localhost:8080",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws origin with empty host",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "https://:5173",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws file origin",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "file://localhost",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws unsupported scheme origin",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "wss://localhost:8080",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "ws origin with out of range port",
			method:           http.MethodGet,
			path:             "/api/v1/ws",
			origin:           "https://localhost:65536",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{cfg: tc.cfg, hub: ws.NewHub()}
			if tc.withLimit {
				s.realtimeLimit = newRequestLimiter(1)
				s.realtimeMax = 1
				if !s.realtimeLimit.tryAcquire() {
					t.Fatal("failed to pre-acquire realtime slot")
				}
			}

			rr := httptest.NewRecorder()
			req := httptest.NewRequest(tc.method, "http://127.0.0.1:8080"+tc.path, nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}

			switch tc.path {
			case "/api/v1/events":
				s.handleEventsSSE(rr, req)
			case "/api/v1/ws":
				s.handleWSUpgrade(rr, req)
			default:
				t.Fatalf("unexpected path %q", tc.path)
			}

			if rr.Code != tc.wantCode {
				t.Fatalf("status=%d, want %d", rr.Code, tc.wantCode)
			}
			if tc.wantRetryAfter != "" {
				if got := rr.Header().Get("Retry-After"); got != tc.wantRetryAfter {
					t.Fatalf("Retry-After=%q, want %q", got, tc.wantRetryAfter)
				}
			}
			if tc.wantBodyContains != "" && !strings.Contains(rr.Body.String(), tc.wantBodyContains) {
				t.Fatalf("body=%q, want %q", rr.Body.String(), tc.wantBodyContains)
			}
			if tc.wantRateLimit {
				var resp models.ErrorResponse
				if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
					t.Fatalf("decode response: %v", err)
				}
				if resp.Error.Code != "rate_limited" {
					t.Fatalf("error.code=%q, want %q", resp.Error.Code, "rate_limited")
				}
			}
		})
	}
}

func TestRealtimeSSESuccessPath(t *testing.T) {
	cases := []struct {
		name   string
		cfg    config.Config
		origin string
	}{
		{
			name: "localhost origin",
		},
		{
			name:   "allowlisted custom host origin",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "http://s3desk.local:8080",
		},
		{
			name:   "allowlisted mixed case host origin",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "https://S3DESK.LOCAL.:8443",
		},
		{
			name:   "allowlisted ipv6 ula origin",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"[FD00::25]"}},
			origin: "https://[fd00::25]:8443",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{cfg: tc.cfg, hub: ws.NewHub()}
			srv := httptest.NewServer(http.HandlerFunc(s.handleEventsSSE))
			defer srv.Close()

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			req, err := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL, nil)
			if err != nil {
				t.Fatalf("new request: %v", err)
			}
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			} else {
				req.Header.Set("Origin", srv.URL)
			}

			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("do request: %v", err)
			}
			defer res.Body.Close()

			if res.StatusCode != http.StatusOK {
				t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
			}
			if got := res.Header.Get("Content-Type"); !strings.Contains(got, "text/event-stream") {
				t.Fatalf("Content-Type=%q, want SSE content type", got)
			}

			line, err := bufio.NewReader(res.Body).ReadString('\n')
			if err != nil {
				t.Fatalf("read first line: %v", err)
			}
			if line != ": ok\n" {
				t.Fatalf("first line=%q, want %q", line, ": ok\n")
			}
			cancel()
		})
	}
}

func TestRealtimeWSSuccessPath(t *testing.T) {
	cases := []struct {
		name   string
		cfg    config.Config
		origin string
	}{
		{
			name: "localhost origin",
		},
		{
			name:   "allowlisted custom host origin",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "http://s3desk.local:8080",
		},
		{
			name:   "allowlisted mixed case host origin",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"s3desk.local"}},
			origin: "https://S3DESK.LOCAL.:8443",
		},
		{
			name:   "allowlisted ipv6 ula origin",
			cfg:    config.Config{AllowRemote: true, AllowedHosts: []string{"[FD00::25]"}},
			origin: "https://[fd00::25]:8443",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{cfg: tc.cfg, hub: ws.NewHub()}
			srv := httptest.NewServer(http.HandlerFunc(s.handleWSUpgrade))
			defer srv.Close()

			wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
			header := http.Header{}
			if tc.origin != "" {
				header.Set("Origin", tc.origin)
			} else {
				header.Set("Origin", srv.URL)
			}

			conn, res, err := websocket.DefaultDialer.Dial(wsURL, header)
			if err != nil {
				if res != nil {
					t.Fatalf("dial websocket: %v (status=%d)", err, res.StatusCode)
				}
				t.Fatalf("dial websocket: %v", err)
			}
			defer conn.Close()

			if err := conn.SetReadDeadline(time.Now().Add(250 * time.Millisecond)); err != nil {
				t.Fatalf("set read deadline: %v", err)
			}
			if _, _, err := conn.ReadMessage(); err == nil {
				t.Fatal("expected connection to stay idle without initial websocket payload")
			} else if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) && !strings.Contains(err.Error(), "i/o timeout") {
				t.Fatalf("unexpected websocket read result: %v", err)
			}
		})
	}
}

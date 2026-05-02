package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"s3desk/internal/config"
)

type failingRealtimeTicketReader struct{}

func (failingRealtimeTicketReader) Read(_ []byte) (int, error) {
	return 0, errors.New("entropy unavailable")
}

func TestCreateRealtimeTicketOriginPolicy(t *testing.T) {
	cases := []struct {
		name              string
		useServerOrigin   bool
		withFailingReader bool
		origin            string
		wantCode          int
		wantBodyContains  string
	}{
		{
			name:              "trusted origin but entropy failure",
			useServerOrigin:   true,
			withFailingReader: true,
			wantCode:          http.StatusInternalServerError,
			wantBodyContains:  "failed to create realtime ticket",
		},
		{
			name:             "missing origin",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "trusted Origin",
		},
		{
			name:             "mismatched origin host",
			origin:           "http://example.com",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "origin must be localhost",
		},
		{
			name:             "null origin",
			origin:           "null",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "origin with path",
			origin:           "http://127.0.0.1:8080/app",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "origin with trailing slash",
			origin:           "https://localhost:8080/",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "origin with query",
			origin:           "https://localhost:8080?from=app",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "origin with fragment",
			origin:           "https://localhost:8080#stale-fragment",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "origin with userinfo",
			origin:           "https://user@localhost:8080",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "origin with empty host",
			origin:           "https://:5173",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "file origin",
			origin:           "file://localhost",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "unsupported scheme origin",
			origin:           "wss://localhost:8080",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
		{
			name:             "origin with out of range port",
			origin:           "https://localhost:65536",
			wantCode:         http.StatusForbidden,
			wantBodyContains: "invalid origin",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, srv := newTestServer(t, testEncryptionKey())
			if tc.withFailingReader {
				previousReader := realtimeTicketRandReader
				realtimeTicketRandReader = failingRealtimeTicketReader{}
				t.Cleanup(func() {
					realtimeTicketRandReader = previousReader
				})
			}

			req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/realtime-ticket?transport=ws", nil)
			if err != nil {
				t.Fatalf("new request: %v", err)
			}
			if tc.useServerOrigin {
				req.Header.Set("Origin", srv.URL)
			} else if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("do request: %v", err)
			}
			defer res.Body.Close()

			if res.StatusCode != tc.wantCode {
				body, _ := io.ReadAll(res.Body)
				t.Fatalf("expected status %d, got %d: %s", tc.wantCode, res.StatusCode, string(body))
			}
			body, _ := io.ReadAll(res.Body)
			if !strings.Contains(string(body), tc.wantBodyContains) {
				t.Fatalf("expected body to contain %q, got %s", tc.wantBodyContains, string(body))
			}
		})
	}
}

func TestCreateRealtimeTicketOriginPolicy_AcceptsAllowlistedMixedCaseHostOrigin(t *testing.T) {
	t.Parallel()

	_, srv := newTestServerWithConfig(t, config.Config{
		AllowRemote:   true,
		AllowedHosts:  []string{"s3desk.local"},
		EncryptionKey: testEncryptionKey(),
	})

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/realtime-ticket?transport=ws", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Origin", "https://S3DESK.LOCAL.:8443")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, res.StatusCode, string(body))
	}
	var resp realtimeTicketResponse
	if err := json.NewDecoder(res.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Transport != "ws" {
		t.Fatalf("resp.Transport=%q, want ws", resp.Transport)
	}
	if resp.Ticket == "" {
		t.Fatal("expected ticket")
	}
}

func TestCreateRealtimeTicketOriginPolicy_AcceptsAllowlistedIPv6ULAOrigin(t *testing.T) {
	t.Parallel()

	_, srv := newTestServerWithConfig(t, config.Config{
		AllowRemote:   true,
		AllowedHosts:  []string{"fd00::25"},
		EncryptionKey: testEncryptionKey(),
	})

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/realtime-ticket?transport=ws", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Origin", "https://[FD00::25]:8443")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, res.StatusCode, string(body))
	}
	var resp realtimeTicketResponse
	if err := json.NewDecoder(res.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Transport != "ws" {
		t.Fatalf("resp.Transport=%q, want ws", resp.Transport)
	}
	if resp.Ticket == "" {
		t.Fatal("expected ticket")
	}
}

package api

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
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

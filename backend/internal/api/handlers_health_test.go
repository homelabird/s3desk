package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/ws"
)

func TestReadyzReturnsStoreUnavailableWhenStoreMissing(t *testing.T) {
	handler := New(Dependencies{
		Config: config.Config{
			Addr:      "127.0.0.1:0",
			StaticDir: t.TempDir(),
		},
		Hub:        ws.NewHub(),
		ServerAddr: "127.0.0.1:0",
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	res, err := http.Get(srv.URL + "/readyz")
	if err != nil {
		t.Fatalf("get readyz: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusServiceUnavailable {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 503, got %d: %s", res.StatusCode, string(body))
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "store_unavailable\n" {
		t.Fatalf("expected store_unavailable body, got %q", string(body))
	}
}

func TestReadyzReturnsOKWhenHealthy(t *testing.T) {
	_, srv := newTestServer(t, testEncryptionKey())

	res, err := http.Get(srv.URL + "/readyz")
	if err != nil {
		t.Fatalf("get readyz: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "ok\n" {
		t.Fatalf("expected ok body, got %q", string(body))
	}
}

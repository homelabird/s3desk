package api

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

func TestReadyzReturnsDataDirUnavailableWhenDataDirCannotBeWritten(t *testing.T) {
	st, manager, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	dataDir := filepath.Join(t.TempDir(), "data-file")
	if err := os.WriteFile(dataDir, []byte("not a directory"), 0o600); err != nil {
		t.Fatalf("write data-dir file: %v", err)
	}

	handler := New(Dependencies{
		Config: config.Config{
			Addr:      "127.0.0.1:0",
			DataDir:   dataDir,
			StaticDir: t.TempDir(),
		},
		Store:      st,
		Jobs:       manager,
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
	if string(body) != "data_dir_unavailable\n" {
		t.Fatalf("expected data_dir_unavailable body, got %q", string(body))
	}
}

func TestWorkerzReturnsUnavailableWhenWorkerMissing(t *testing.T) {
	handler := New(Dependencies{
		Config: config.Config{Addr: "127.0.0.1:0", StaticDir: t.TempDir()},
		Hub:    ws.NewHub(),
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	res, err := http.Get(srv.URL + "/workerz")
	if err != nil {
		t.Fatalf("get workerz: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusServiceUnavailable {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d body=%s", res.StatusCode, http.StatusServiceUnavailable, string(body))
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "worker_unavailable\n" {
		t.Fatalf("body=%q, want worker_unavailable", string(body))
	}
}

func TestWorkerzReportsRunningWorkerQueueStats(t *testing.T) {
	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	handler := New(Dependencies{
		Config:     config.Config{Addr: "127.0.0.1:0", DataDir: dataDir, StaticDir: t.TempDir()},
		Store:      st,
		Jobs:       manager,
		Hub:        ws.NewHub(),
		ServerAddr: "127.0.0.1:0",
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(func() {
		cancel()
		waitCtx, waitCancel := context.WithTimeout(context.Background(), time.Second)
		defer waitCancel()
		if err := manager.Wait(waitCtx); err != nil {
			t.Errorf("wait for worker shutdown: %v", err)
		}
	})
	go manager.Run(ctx)
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for !manager.Running() {
		select {
		case <-deadline.C:
			t.Fatal("worker did not start")
		default:
			time.Sleep(time.Millisecond)
		}
	}

	res, err := http.Get(srv.URL + "/workerz")
	if err != nil {
		t.Fatalf("get workerz: %v", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d body=%s", res.StatusCode, http.StatusOK, string(body))
	}
	if !strings.Contains(string(body), "ok\nqueue_depth=0\n") || !strings.Contains(string(body), "queue_capacity=") {
		t.Fatalf("body=%q, want worker queue diagnostics", string(body))
	}
}

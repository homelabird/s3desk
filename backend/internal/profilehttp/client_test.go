package profilehttp

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
	"s3desk/internal/profiletls"
)

func testCache(t *testing.T, capacity int) *clientCache {
	t.Helper()
	c := &clientCache{capacity: capacity, lifetime: time.Hour}
	t.Cleanup(func() {
		for _, e := range c.entries {
			e.client.CloseIdleConnections()
		}
	})
	return c
}
func TestClientsReuseConnectionsAcrossRequests(t *testing.T) {
	c := testCache(t, 8)
	var connections atomic.Int32
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, "ok") }))
	srv.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		if state == http.StateNew {
			connections.Add(1)
		}
	}
	srv.Start()
	defer srv.Close()
	p := models.ProfileSecrets{ID: "one", Endpoint: srv.URL}
	for i := 0; i < 25; i++ {
		client, err := c.get(p, false)
		if err != nil {
			t.Fatal(err)
		}
		resp, err := client.Get(srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
	if got := connections.Load(); got != 1 {
		t.Fatalf("opened %d connections for 25 requests, want 1", got)
	}
}
func TestClientIdentitySeparatesProfilesEndpointsTLSAndRemotePolicy(t *testing.T) {
	c := testCache(t, 8)
	base := models.ProfileSecrets{ID: "one", Endpoint: "https://s3.example.invalid"}
	a, err := c.get(base, false)
	if err != nil {
		t.Fatal(err)
	}
	variants := []models.ProfileSecrets{base, base, base}
	variants[0].ID = "two"
	variants[1].Endpoint = "https://other.example.invalid"
	variants[2].TLSConfig = &models.ProfileTLSConfig{Mode: models.ProfileTLSModeDisabled}
	for _, p := range variants {
		other, err := c.get(p, false)
		if err != nil {
			t.Fatal(err)
		}
		if a == other {
			t.Fatal("different transport identity reused")
		}
	}
	remote, err := c.get(base, true)
	if err != nil {
		t.Fatal(err)
	}
	if a == remote {
		t.Fatal("remote policy shared")
	}
	// S3 keys are signed by each caller, not retained in or used to key HTTP pools.
	changed := base
	changed.AccessKeyID = "rotated"
	changed.SecretAccessKey = "rotated-secret"
	same, err := c.get(changed, false)
	if err != nil {
		t.Fatal(err)
	}
	if a != same {
		t.Fatal("credential rotation needlessly discarded transport")
	}
}
func TestPoolBoundedAndExpiredClientsReplaced(t *testing.T) {
	c := testCache(t, 2)
	first := models.ProfileSecrets{ID: "first"}
	a, _ := c.get(first, false)
	c.get(models.ProfileSecrets{ID: "second"}, false)
	c.get(models.ProfileSecrets{ID: "third"}, false)
	if len(c.entries) != 2 {
		t.Fatal("unbounded cache")
	}
	again, _ := c.get(first, false)
	if a == again {
		t.Fatal("old LRU client was not evicted")
	}
	key := clientKey(first, false)
	e := c.entries[key]
	e.created = time.Now().Add(-2 * time.Hour)
	c.entries[key] = e
	renewed, _ := c.get(first, false)
	if renewed == again {
		t.Fatal("expired client reused")
	}
}
func TestConcurrentClientLookupSharesOneClient(t *testing.T) {
	c := testCache(t, 8)
	p := models.ProfileSecrets{ID: "same"}
	var wg sync.WaitGroup
	clients := make(chan *http.Client, 50)
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client, err := c.get(p, false)
			if err != nil {
				t.Error(err)
				return
			}
			clients <- client
		}()
	}
	wg.Wait()
	close(clients)
	var first *http.Client
	for client := range clients {
		if first == nil {
			first = client
		} else if client != first {
			t.Fatal("duplicate cached clients")
		}
	}
}
func TestTLSApprovalRevocationIsCheckedOnCacheHit(t *testing.T) {
	t.Setenv("LOG_ENV", "production")
	t.Setenv(profiletls.TLSSkipVerifyApprovalEnv, "true")
	c := testCache(t, 8)
	p := models.ProfileSecrets{ID: "test", TLSInsecureSkipVerify: true}
	if _, err := c.get(p, false); err != nil {
		t.Fatal(err)
	}
	t.Setenv(profiletls.TLSSkipVerifyApprovalEnv, "false")
	if _, err := c.get(p, false); err == nil {
		t.Fatal("cached insecure client bypassed revoked policy")
	}
}
func TestInvalidTLSIsNotCached(t *testing.T) {
	c := testCache(t, 8)
	p := models.ProfileSecrets{TLSConfig: &models.ProfileTLSConfig{Mode: models.ProfileTLSModeMTLS, ClientCertPEM: "bad", ClientKeyPEM: "bad"}}
	if _, err := c.get(p, false); err == nil {
		t.Fatal("invalid certificate accepted")
	}
	if len(c.entries) != 0 {
		t.Fatal("failed TLS config cached")
	}
}
func TestCachedClientStillBlocksMetadataAndRemoteLoopback(t *testing.T) {
	c := testCache(t, 8)
	client, err := c.get(models.ProfileSecrets{ID: "remote"}, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, endpoint := range []string{"http://169.254.169.254/latest/meta-data", "http://127.0.0.1:1"} {
		if resp, err := client.Get(endpoint); err == nil {
			resp.Body.Close()
			t.Fatalf("accepted %s", endpoint)
		}
	}
}
func BenchmarkConnectionReuse(b *testing.B) {
	for _, reuse := range []bool{false, true} {
		name := "baseline_new_client"
		if reuse {
			name = "cached_client"
		}
		b.Run(name, func(b *testing.B) {
			var conns atomic.Int64
			srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, "ok") }))
			srv.Config.ConnState = func(_ net.Conn, state http.ConnState) {
				if state == http.StateNew {
					conns.Add(1)
					time.Sleep(2 * time.Millisecond)
				}
			}
			srv.Start()
			defer srv.Close()
			c := &clientCache{capacity: 8, lifetime: time.Hour}
			p := models.ProfileSecrets{ID: "bench", Endpoint: srv.URL}
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				var client *http.Client
				if reuse {
					client, _ = c.get(p, false)
				} else {
					client = profileendpoint.NewHTTPClient(profileendpoint.HTTPClientOptions{})
				}
				resp, err := client.Get(srv.URL)
				if err != nil {
					b.Fatal(err)
				}
				io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
				if !reuse {
					client.CloseIdleConnections()
				}
			}
			b.StopTimer()
			for _, e := range c.entries {
				e.client.CloseIdleConnections()
			}
			b.ReportMetric(float64(conns.Load())/float64(b.N), "connections/op")
		})
	}
}

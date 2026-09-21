// Package profilehttp owns bounded, reusable HTTP connection pools for profiles.
// It caches transport identity, never S3 credentials or provider responses.
package profilehttp

import (
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
	"s3desk/internal/profiletls"
)

const maxCachedClients = 32
const clientLifetime = 5 * time.Minute

type entry struct {
	client        *http.Client
	created, used time.Time
}
type clientCache struct {
	mu       sync.Mutex
	entries  map[[32]byte]entry
	capacity int
	lifetime time.Duration
}

var shared = clientCache{capacity: maxCachedClients, lifetime: clientLifetime}

// Client returns an immutable, concurrency-safe client. Callers must still
// validate profile endpoints before use. Every request and every new dial also
// passes the guarded endpoint checks, including redirects and DNS rebinding.
func Client(profile models.ProfileSecrets, allowRemote bool) (*http.Client, error) {
	return shared.get(profile, allowRemote)
}

func clientKey(p models.ProfileSecrets, remote bool) [32]byte {
	// ProfileSecrets deliberately has json:"-" fields: do NOT marshal it directly.
	// Explicit fields ensure TLS identity/policy changes cannot hit an old pool.
	identity := struct {
		ID, Endpoint     string
		Remote, Insecure bool
		TLS              *models.ProfileTLSConfig
	}{p.ID, p.Endpoint, remote, p.TLSInsecureSkipVerify, p.TLSConfig}
	encoded, _ := json.Marshal(identity) // fixed string/bool/struct fields cannot fail
	return sha256.Sum256(encoded)
}

func (c *clientCache) get(p models.ProfileSecrets, remote bool) (*http.Client, error) {
	// Runtime policy is checked on cache hits too; revoking approval must work.
	if p.TLSInsecureSkipVerify {
		if err := profiletls.ValidateSkipVerifyPolicy(); err != nil {
			return nil, err
		}
	}
	key := clientKey(p, remote)
	c.mu.Lock()
	if client := c.lookupLocked(key, time.Now()); client != nil {
		c.mu.Unlock()
		return client, nil
	}
	c.mu.Unlock()
	// Certificate parsing can be expensive; never block other profiles behind it.
	cfg, err := profiletls.BuildConfig(p)
	if err != nil {
		return nil, err
	}
	client := profileendpoint.NewHTTPClient(profileendpoint.HTTPClientOptions{AllowRemote: remote, TLSConfig: cfg})
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	if existing := c.lookupLocked(key, now); existing != nil {
		client.CloseIdleConnections()
		return existing, nil
	}
	if c.entries == nil {
		c.entries = make(map[[32]byte]entry)
	}
	if len(c.entries) >= c.capacity {
		var oldestKey [32]byte
		var oldest time.Time
		for k, e := range c.entries {
			if oldest.IsZero() || e.used.Before(oldest) {
				oldestKey, oldest = k, e.used
			}
		}
		c.entries[oldestKey].client.CloseIdleConnections()
		delete(c.entries, oldestKey)
	}
	c.entries[key] = entry{client: client, created: now, used: now}
	return client, nil
}

func (c *clientCache) lookupLocked(key [32]byte, now time.Time) *http.Client {
	for k, e := range c.entries {
		if now.Sub(e.created) >= c.lifetime {
			e.client.CloseIdleConnections() // active streams remain valid
			delete(c.entries, k)
		}
	}
	if e, ok := c.entries[key]; ok {
		e.used = now
		c.entries[key] = e
		return e.client
	}
	return nil
}

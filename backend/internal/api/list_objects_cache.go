package api

import (
	"sync"
	"time"

	"s3desk/internal/models"
)

type listObjectsCacheEntry struct {
	createdAt time.Time
	expiresAt time.Time
	response  models.ListObjectsResponse
}

type listObjectsCache struct {
	mu         sync.Mutex
	entries    map[string]listObjectsCacheEntry
	maxEntries int
	ttl        time.Duration
}

func newListObjectsCache(maxEntries int, ttl time.Duration) *listObjectsCache {
	if maxEntries <= 0 || ttl <= 0 {
		return nil
	}
	return &listObjectsCache{
		entries:    make(map[string]listObjectsCacheEntry, maxEntries),
		maxEntries: maxEntries,
		ttl:        ttl,
	}
}

func (c *listObjectsCache) get(key string) (models.ListObjectsResponse, bool) {
	if c == nil {
		return models.ListObjectsResponse{}, false
	}
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok {
		return models.ListObjectsResponse{}, false
	}
	if now.After(entry.expiresAt) {
		delete(c.entries, key)
		return models.ListObjectsResponse{}, false
	}
	return cloneListObjectsResponse(entry.response), true
}

func (c *listObjectsCache) set(key string, resp models.ListObjectsResponse) {
	if c == nil {
		return
	}
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= c.maxEntries {
		var oldestKey string
		var oldestTime time.Time
		for k, v := range c.entries {
			if oldestKey == "" || v.createdAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = v.createdAt
			}
		}
		if oldestKey != "" {
			delete(c.entries, oldestKey)
		}
	}
	c.entries[key] = listObjectsCacheEntry{
		createdAt: now,
		expiresAt: now.Add(c.ttl),
		response:  cloneListObjectsResponse(resp),
	}
}

func cloneListObjectsResponse(src models.ListObjectsResponse) models.ListObjectsResponse {
	dst := src
	if src.CommonPrefixes != nil {
		dst.CommonPrefixes = append([]string(nil), src.CommonPrefixes...)
	}
	if src.Items != nil {
		dst.Items = append([]models.ObjectItem(nil), src.Items...)
	}
	return dst
}

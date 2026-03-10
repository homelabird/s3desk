package api

import (
	"crypto/rand"
	"encoding/base64"
	"sync"
	"time"
)

type realtimeTicketStore struct {
	mu      sync.Mutex
	entries map[string]realtimeTicket
	ttl     time.Duration
}

type realtimeTicket struct {
	transport string
	expiresAt time.Time
}

func newRealtimeTicketStore(ttl time.Duration) *realtimeTicketStore {
	return &realtimeTicketStore{
		entries: make(map[string]realtimeTicket),
		ttl:     ttl,
	}
}

func (s *realtimeTicketStore) Issue(transport string, expiresAt time.Time) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked(time.Now().UTC())
	for {
		token := randomRealtimeTicket()
		if _, exists := s.entries[token]; exists {
			continue
		}
		s.entries[token] = realtimeTicket{
			transport: transport,
			expiresAt: expiresAt,
		}
		return token
	}
}

func (s *realtimeTicketStore) Consume(token, transport string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked(now)
	entry, ok := s.entries[token]
	if !ok {
		return false
	}
	delete(s.entries, token)
	if entry.transport != transport {
		return false
	}
	if now.After(entry.expiresAt) {
		return false
	}
	return true
}

func (s *realtimeTicketStore) pruneLocked(now time.Time) {
	for token, entry := range s.entries {
		if now.After(entry.expiresAt) {
			delete(s.entries, token)
		}
	}
}

func randomRealtimeTicket() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}

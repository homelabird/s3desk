// Package keyedmutex serializes one resource without blocking unrelated work.
package keyedmutex

import (
	"context"
	"sync"
)

type waiter struct {
	token chan struct{}
	refs  int
}

// Mutex has a usable zero value. It must not be copied after first use.
// Entries are reference-counted, including canceled waiters, and removed when
// unused so user-supplied object names cannot grow an unbounded lock registry.
type Mutex[K comparable] struct {
	mu      sync.Mutex
	entries map[K]*waiter
}

// Lock waits for key or context cancellation. The returned unlock is idempotent.
func (m *Mutex[K]) Lock(ctx context.Context, key K) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	if m.entries == nil {
		m.entries = make(map[K]*waiter)
	}
	w := m.entries[key]
	if w == nil {
		w = &waiter{token: make(chan struct{}, 1)}
		w.token <- struct{}{}
		m.entries[key] = w
	}
	w.refs++
	m.mu.Unlock()
	releaseRef := func() {
		m.mu.Lock()
		w.refs--
		if w.refs == 0 {
			delete(m.entries, key)
		}
		m.mu.Unlock()
	}
	select {
	case <-ctx.Done():
		releaseRef()
		return nil, ctx.Err()
	case <-w.token:
	}
	var once sync.Once
	unlock := func() { once.Do(func() { w.token <- struct{}{}; releaseRef() }) }
	// Both token and cancellation may have been ready in the select above.
	if err := ctx.Err(); err != nil {
		unlock()
		return nil, err
	}
	return unlock, nil
}

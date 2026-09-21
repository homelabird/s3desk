package keyedmutex

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestIndependentKeysDoNotBlock(t *testing.T) {
	var m Mutex[string]
	unlock, err := m.Lock(context.Background(), "slow-file")
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	other, err := m.Lock(ctx, "other-file")
	if err != nil {
		t.Fatalf("unrelated object blocked: %v", err)
	}
	other()
}
func TestSameKeySerializesAndReclaimsEntries(t *testing.T) {
	var m Mutex[string]
	var active, overlap atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			unlock, err := m.Lock(context.Background(), "same")
			if err != nil {
				t.Error(err)
				return
			}
			if active.Add(1) != 1 {
				overlap.Add(1)
			}
			time.Sleep(time.Microsecond)
			active.Add(-1)
			unlock()
			unlock()
		}()
	}
	wg.Wait()
	if overlap.Load() != 0 {
		t.Fatal("same object overlapped")
	}
	if len(m.entries) != 0 {
		t.Fatalf("leaked %d locks", len(m.entries))
	}
}
func TestCanceledWaiterDoesNotBlockOrLeak(t *testing.T) {
	var m Mutex[string]
	unlock, _ := m.Lock(context.Background(), "same")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := m.Lock(ctx, "same"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err=%v", err)
	}
	unlock()
	if len(m.entries) != 0 {
		t.Fatal("canceled waiter leaked")
	}
	canceled, c := context.WithCancel(context.Background())
	c()
	if _, err := m.Lock(canceled, "new"); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if len(m.entries) != 0 {
		t.Fatal("already canceled request allocated a lock")
	}
}
func TestDistinctObjectsDoNotAccumulateLocks(t *testing.T) {
	var m Mutex[string]
	for i := 0; i < 10000; i++ {
		unlock, err := m.Lock(context.Background(), fmt.Sprint(i))
		if err != nil {
			t.Fatal(err)
		}
		unlock()
	}
	if len(m.entries) != 0 {
		t.Fatal("unused keys retained")
	}
}
func TestStructuredKeysDoNotCollide(t *testing.T) {
	type key struct{ profile, upload, path string }
	var m Mutex[key]
	a, _ := m.Lock(context.Background(), key{"a/b", "c", "d"})
	defer a()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	b, err := m.Lock(ctx, key{"a", "b/c", "d"})
	if err != nil {
		t.Fatal(err)
	}
	b()
}

func BenchmarkMultipartCreationContention(b *testing.B) {
	for _, global := range []bool{true, false} {
		name := "per_object"
		if global {
			name = "baseline_global"
		}
		b.Run(name, func(b *testing.B) {
			var m Mutex[string]
			var id atomic.Int64
			b.RunParallel(func(pb *testing.PB) {
				key := fmt.Sprint(id.Add(1))
				if global {
					key = "all"
				}
				for pb.Next() {
					unlock, _ := m.Lock(context.Background(), key)
					time.Sleep(time.Millisecond)
					unlock()
				}
			})
		})
	}
}

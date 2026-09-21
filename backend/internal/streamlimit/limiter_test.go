package streamlimit

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestGlobalAndProfileLimits(t *testing.T) {
	l := New(3, 2)
	a, ok := l.Acquire("a")
	if !ok {
		t.Fatal("a1")
	}
	b, ok := l.Acquire("a")
	if !ok {
		t.Fatal("a2")
	}
	if _, ok = l.Acquire("a"); ok {
		t.Fatal("profile bound bypass")
	}
	c, ok := l.Acquire("b")
	if !ok {
		t.Fatal("b1")
	}
	if _, ok = l.Acquire("c"); ok {
		t.Fatal("global bound bypass")
	}
	a()
	a()
	if l.Active() != 2 {
		t.Fatal("release not idempotent")
	}
	b()
	c()
	if len(l.profiles) != 0 || l.Active() != 0 {
		t.Fatal("leaked profile state")
	}
}
func TestConcurrentLimitAndRecovery(t *testing.T) {
	l := New(8, 4)
	var wg sync.WaitGroup
	var violation atomic.Bool
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			release, ok := l.Acquire("same-profile")
			if !ok {
				return
			}
			defer release()
			if l.Active() > 4 {
				violation.Store(true)
			}
			time.Sleep(time.Millisecond)
		}()
	}
	wg.Wait()
	if violation.Load() || l.Active() != 0 {
		t.Fatal("bound/recovery")
	}
	release, ok := l.Acquire("same-profile")
	if !ok {
		t.Fatal("slots not recovered")
	}
	release()
}
func TestSafeDefaults(t *testing.T) {
	l := New(0, 0)
	if l.max != 8 || l.perProfile != 4 {
		t.Fatal("unbounded defaults")
	}
}

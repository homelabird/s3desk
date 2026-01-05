package dirlock

import (
	"errors"
	"testing"
)

func TestAcquireRelease(t *testing.T) {
	dir := t.TempDir()
	l1, err := Acquire(dir)
	if err != nil {
		t.Fatalf("Acquire 1: %v", err)
	}
	defer func() { _ = l1.Release() }()

	_, err = Acquire(dir)
	if err == nil {
		t.Fatalf("expected second Acquire to fail")
	}
	if !errors.Is(err, ErrLocked) {
		t.Fatalf("expected ErrLocked, got %v", err)
	}

	if err := l1.Release(); err != nil {
		t.Fatalf("Release: %v", err)
	}

	l2, err := Acquire(dir)
	if err != nil {
		t.Fatalf("Acquire 2 after Release: %v", err)
	}
	_ = l2.Release()
}

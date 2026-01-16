package dirlock

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ErrLocked is returned when the data directory is already locked by another process.
var ErrLocked = errors.New("data dir is locked")

// Lock represents an acquired directory lock.
// The lock is held for as long as the underlying file handle remains open.
type Lock struct {
	path string
	f    *os.File
}

// LockPath returns the lock file path for a given data directory.
func LockPath(dataDir string) string {
	return filepath.Join(dataDir, ".s3desk.lock")
}

// Acquire acquires an exclusive, non-blocking lock for the given data directory.
//
// The lock is implemented as an OS-level file lock on a well-known lock file
// inside the data directory.
func Acquire(dataDir string) (*Lock, error) {
	lockPath := LockPath(dataDir)
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, err
	}
	// #nosec G304 -- lockPath is derived from the configured data directory.
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := lockFile(f); err != nil {
		_ = f.Close()
		if errors.Is(err, ErrLocked) {
			return nil, fmt.Errorf("%w: %s", ErrLocked, lockPath)
		}
		return nil, err
	}

	// Best-effort: write who holds the lock for debugging.
	_ = f.Truncate(0)
	_, _ = f.Seek(0, 0)
	_, _ = fmt.Fprintf(f, "pid=%d\nstarted_at=%s\n", os.Getpid(), time.Now().UTC().Format(time.RFC3339))
	_ = f.Sync()

	return &Lock{path: lockPath, f: f}, nil
}

// Path returns the lock file path.
func (l *Lock) Path() string {
	if l == nil {
		return ""
	}
	return l.path
}

// Release unlocks and closes the lock.
func (l *Lock) Release() error {
	if l == nil || l.f == nil {
		return nil
	}
	err := unlockFile(l.f)
	_ = l.f.Close()
	l.f = nil
	return err
}

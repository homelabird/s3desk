//go:build !windows

package dirlock

import (
	"errors"
	"os"

	"golang.org/x/sys/unix"
)

func lockFile(f *os.File) error {
	if f == nil {
		return errors.New("nil file")
	}
	// Non-blocking exclusive lock.
	if err := unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		if err == unix.EWOULDBLOCK {
			return ErrLocked
		}
		return err
	}
	return nil
}

func unlockFile(f *os.File) error {
	if f == nil {
		return nil
	}
	return unix.Flock(int(f.Fd()), unix.LOCK_UN)
}

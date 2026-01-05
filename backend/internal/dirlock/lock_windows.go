//go:build windows

package dirlock

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

func lockFile(f *os.File) error {
	if f == nil {
		return errors.New("nil file")
	}
	h := windows.Handle(f.Fd())
	var ol windows.Overlapped
	err := windows.LockFileEx(h, windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &ol)
	if err != nil {
		if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
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
	h := windows.Handle(f.Fd())
	var ol windows.Overlapped
	// Unlock the single byte we locked.
	return windows.UnlockFileEx(h, 0, 1, 0, &ol)
}

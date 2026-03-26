//go:build !windows

package dirlock

import (
	"errors"
	"os"

	"golang.org/x/sys/unix"
)

const maxIntFileDescriptor = uintptr(^uint(0) >> 1)

func fileDescriptorInt(f *os.File) (int, error) {
	if f == nil {
		return 0, errors.New("nil file")
	}
	fd := f.Fd()
	if fd > maxIntFileDescriptor {
		return 0, errors.New("file descriptor out of range")
	}
	return int(fd), nil
}

func lockFile(f *os.File) error {
	fd, err := fileDescriptorInt(f)
	if err != nil {
		return err
	}
	// Non-blocking exclusive lock.
	if err := unix.Flock(fd, unix.LOCK_EX|unix.LOCK_NB); err != nil {
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
	fd, err := fileDescriptorInt(f)
	if err != nil {
		return err
	}
	return unix.Flock(fd, unix.LOCK_UN)
}

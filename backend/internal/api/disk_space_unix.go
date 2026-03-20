//go:build !windows

package api

import (
	"fmt"

	"golang.org/x/sys/unix"
)

func availableDiskBytes(path string) (int64, error) {
	var stat unix.Statfs_t
	if err := unix.Statfs(path, &stat); err != nil {
		return 0, err
	}
	if stat.Bsize < 0 {
		return 0, fmt.Errorf("negative filesystem block size %d", stat.Bsize)
	}
	if stat.Bsize == 0 || stat.Bavail == 0 {
		return 0, nil
	}
	blockSize := uint64(stat.Bsize)
	const maxDiskBytes = int64(^uint64(0) >> 1)
	if stat.Bavail > uint64(maxDiskBytes)/blockSize {
		return maxDiskBytes, nil
	}
	// #nosec G115 -- the multiplication is bounded against MaxInt64 above before converting to int64.
	return int64(stat.Bavail * blockSize), nil
}

//go:build windows

package api

import "golang.org/x/sys/windows"

func availableDiskBytes(path string) (int64, error) {
	target, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	var freeBytesAvailable uint64
	if err := windows.GetDiskFreeSpaceEx(target, &freeBytesAvailable, nil, nil); err != nil {
		return 0, err
	}
	return int64(freeBytesAvailable), nil
}

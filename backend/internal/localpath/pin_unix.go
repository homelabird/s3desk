//go:build linux || darwin || freebsd || netbsd || openbsd || dragonfly || solaris

package localpath

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

// OpenPinnedDirUnderRoots opens path as a directory without following symlink
// components below the matching allowed root. The returned file pins the target
// directory for callers that must hand a stable destination to another process.
func OpenPinnedDirUnderRoots(path string, roots []string) (*os.File, error) {
	abs, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return nil, err
	}

	if len(roots) == 0 {
		return openPinnedDir(abs, abs)
	}

	for _, root := range roots {
		root = filepath.Clean(root)
		if root == "" || root == "." {
			continue
		}
		rootAbs, err := filepath.Abs(root)
		if err != nil {
			return nil, err
		}
		if !IsUnderDir(rootAbs, abs) {
			continue
		}
		rel, err := filepath.Rel(rootAbs, abs)
		if err != nil {
			return nil, err
		}
		return openPinnedDirFromRoot(rootAbs, rel, abs)
	}

	return nil, fmt.Errorf("path %q is not under an allowed local directory", abs)
}

func openPinnedDir(path, label string) (*os.File, error) {
	if !filepath.IsAbs(path) {
		return nil, fmt.Errorf("path %q must be absolute", path)
	}
	root := string(os.PathSeparator)
	rel := strings.TrimPrefix(path, root)
	if rel == "" {
		rel = "."
	}
	return openPinnedDirFromRoot(root, rel, label)
}

func openPinnedDirFromRoot(root, rel, label string) (*os.File, error) {
	fd, err := unix.Open(root, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_DIRECTORY|unix.O_NOFOLLOW, 0)
	if err != nil {
		if isSymlinkOpenError(root, err) {
			return nil, &SymlinkComponentError{Path: root}
		}
		return nil, fmt.Errorf("open local root %q: %w", root, err)
	}

	current := root
	if rel == "." || rel == "" {
		return newPinnedDirFile(fd, label)
	}

	parts := strings.Split(rel, string(os.PathSeparator))
	for _, part := range parts {
		if part == "" || part == "." {
			continue
		}
		if part == ".." {
			_ = unix.Close(fd)
			return nil, fmt.Errorf("path %q escapes local root %q", label, root)
		}

		nextPath := filepath.Join(current, part)
		nextFD, err := unix.Openat(fd, part, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_DIRECTORY|unix.O_NOFOLLOW, 0)
		_ = unix.Close(fd)
		if err != nil {
			if isSymlinkOpenError(nextPath, err) {
				return nil, &SymlinkComponentError{Path: nextPath}
			}
			return nil, fmt.Errorf("open local path component %q: %w", nextPath, err)
		}
		fd = nextFD
		current = nextPath
	}

	return newPinnedDirFile(fd, label)
}

func newPinnedDirFile(fd int, label string) (*os.File, error) {
	if fd < 0 {
		return nil, fmt.Errorf("open local path %q: invalid file descriptor %d", label, fd)
	}
	return os.NewFile(uintptr(fd), label), nil // #nosec G115 -- successful unix.Open/Openat returns a non-negative OS file descriptor; os.NewFile requires uintptr.
}

func isSymlinkOpenError(path string, err error) bool {
	if err == unix.ELOOP {
		return true
	}
	if err != unix.ENOTDIR {
		return false
	}
	info, statErr := os.Lstat(path)
	return statErr == nil && info.Mode()&os.ModeSymlink != 0
}

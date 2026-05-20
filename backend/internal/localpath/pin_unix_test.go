//go:build linux || darwin || freebsd || netbsd || openbsd || dragonfly || solaris

package localpath

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestOpenPinnedDirUnderRootsRejectsSymlinkAncestor(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	realDir := filepath.Join(root, "real")
	if err := os.MkdirAll(filepath.Join(realDir, "dst"), 0o755); err != nil {
		t.Fatalf("mkdir real dir: %v", err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(realDir, link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	_, err := OpenPinnedDirUnderRoots(filepath.Join(link, "dst"), []string{root})
	if err == nil {
		t.Fatal("OpenPinnedDirUnderRoots() error=nil, want symlink rejection")
	}
	if !strings.Contains(err.Error(), "symlinked local paths are not allowed") {
		t.Fatalf("error=%q, want symlink rejection", err.Error())
	}
}

func TestOpenPinnedDirUnderRootsKeepsOriginalDirectoryAfterPathSwap(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	dst := filepath.Join(root, "dst")
	if err := os.MkdirAll(dst, 0o755); err != nil {
		t.Fatalf("mkdir dst: %v", err)
	}

	pinned, err := OpenPinnedDirUnderRoots(dst, []string{root})
	if err != nil {
		t.Fatalf("OpenPinnedDirUnderRoots() error=%v", err)
	}
	defer func() { _ = pinned.Close() }()

	fdPath := selfFDPath(pinned.Fd())
	if _, err := os.Stat(fdPath); err != nil {
		t.Skipf("fd path %q unavailable: %v", fdPath, err)
	}

	moved := filepath.Join(root, "moved")
	if err := os.Rename(dst, moved); err != nil {
		t.Fatalf("rename dst: %v", err)
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		t.Fatalf("mkdir replacement dst: %v", err)
	}

	if err := os.WriteFile(filepath.Join(fdPath, "probe.txt"), []byte("pinned"), 0o600); err != nil {
		t.Fatalf("write through pinned fd: %v", err)
	}
	if _, err := os.Stat(filepath.Join(moved, "probe.txt")); err != nil {
		t.Fatalf("expected probe in original directory: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "probe.txt")); !os.IsNotExist(err) {
		t.Fatalf("replacement directory probe stat err=%v, want not exist", err)
	}
}

func selfFDPath(fd uintptr) string {
	base := "/dev/fd"
	if runtime.GOOS == "linux" {
		base = "/proc/self/fd"
	}
	return filepath.Join(base, fmt.Sprintf("%d", fd))
}

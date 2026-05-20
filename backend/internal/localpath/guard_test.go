package localpath

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestRejectSymlinkComponentsUnderRoots(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	realDir := filepath.Join(root, "real")
	if err := os.MkdirAll(realDir, 0o755); err != nil {
		t.Fatalf("mkdir real dir: %v", err)
	}

	if err := RejectSymlinkComponentsUnderRoots(filepath.Join(realDir, "child"), []string{root}); err != nil {
		t.Fatalf("RejectSymlinkComponentsUnderRoots() error=%v, want nil", err)
	}

	link := filepath.Join(root, "link")
	if err := os.Symlink(realDir, link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	err := RejectSymlinkComponentsUnderRoots(filepath.Join(link, "child"), []string{root})
	if err == nil {
		t.Fatal("RejectSymlinkComponentsUnderRoots() error=nil, want symlink error")
	}
	var symlinkErr *SymlinkComponentError
	if !errors.As(err, &symlinkErr) {
		t.Fatalf("error=%T %v, want SymlinkComponentError", err, err)
	}
	if symlinkErr.Path != link {
		t.Fatalf("symlinkErr.Path=%q, want %q", symlinkErr.Path, link)
	}
}

func TestRejectSymlinkComponentsUnderRootsIgnoresPathsOutsideRoots(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	outside := t.TempDir()
	realDir := filepath.Join(outside, "real")
	if err := os.MkdirAll(realDir, 0o755); err != nil {
		t.Fatalf("mkdir real dir: %v", err)
	}
	link := filepath.Join(outside, "link")
	if err := os.Symlink(realDir, link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	if err := RejectSymlinkComponentsUnderRoots(filepath.Join(link, "child"), []string{root}); err != nil {
		t.Fatalf("RejectSymlinkComponentsUnderRoots() error=%v, want nil for path outside roots", err)
	}
}

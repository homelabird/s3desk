package api

import (
	"os"
	"path/filepath"
	"testing"
)

func TestManagedServerRestoreStagingDirCommit(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	staging, err := newManagedServerRestoreStagingDir(baseRoot, "restore-01")
	if err != nil {
		t.Fatalf("newManagedServerRestoreStagingDir() error = %v", err)
	}

	if err := os.WriteFile(filepath.Join(staging.TempRoot(), "manifest.json"), []byte("{}"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	if err := staging.Commit(); err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
	staging.Cleanup()

	if _, err := os.Stat(filepath.Join(staging.FinalRoot(), "manifest.json")); err != nil {
		t.Fatalf("Stat(final manifest) error = %v", err)
	}
	if _, err := os.Stat(staging.TempRoot()); !os.IsNotExist(err) {
		t.Fatalf("Stat(tempRoot) expected not exist, got err = %v", err)
	}
}

func TestTempServerRestoreStagingDirReleaseAndCleanup(t *testing.T) {
	t.Parallel()

	staging, err := newTempServerRestoreStagingDir("s3desk-portable-import-*")
	if err != nil {
		t.Fatalf("newTempServerRestoreStagingDir() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(staging.TempRoot(), "payload.bin"), []byte("hello"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	released := staging.ReleaseTempRoot()
	staging.Cleanup()

	if _, err := os.Stat(filepath.Join(released, "payload.bin")); err != nil {
		t.Fatalf("Stat(released payload) error = %v", err)
	}
	if err := os.RemoveAll(released); err != nil {
		t.Fatalf("RemoveAll(released) error = %v", err)
	}
}

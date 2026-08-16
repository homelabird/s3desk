package api

import (
	"os"
	"path/filepath"
	"testing"

	"s3desk/internal/config"
)

func TestServerBackupNFSTransferRoundTrip(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(t.TempDir(), "backup.tar.gz")
	want := []byte("validated backup bundle")
	if err := os.WriteFile(source, want, 0o600); err != nil {
		t.Fatal(err)
	}

	srv := &server{cfg: config.Config{AllowedLocalDirs: []string{root}, ServerRestoreMaxBytes: 1024}}
	target := filepath.Join(root, "nested", "backup.tar.gz")
	location := serverBackupTransferLocation{Protocol: serverBackupProtocolNFS, Path: target}
	stored, err := srv.writeServerBackupTransfer(t.Context(), source, "backup.tar.gz", location)
	if err != nil {
		t.Fatalf("writeServerBackupTransfer() error=%v", err)
	}
	fetched, cleanup, err := srv.readServerBackupTransfer(t.Context(), location)
	if err != nil {
		t.Fatalf("readServerBackupTransfer() error=%v", err)
	}
	defer cleanup()
	got, err := os.ReadFile(fetched)
	if err != nil {
		t.Fatal(err)
	}
	if stored != target || string(got) != string(want) {
		t.Fatalf("stored=%q data=%q, want %q %q", stored, got, target, want)
	}
}

func TestServerBackupNFSTransferRejectsOutsideAllowedRoots(t *testing.T) {
	root := t.TempDir()
	srv := &server{cfg: config.Config{AllowedLocalDirs: []string{root}}}
	_, _, _, _, err := srv.prepareServerBackupTransfer(t.Context(), serverBackupTransferLocation{
		Protocol: serverBackupProtocolNFS,
		Path:     filepath.Join(t.TempDir(), "backup.tar.gz"),
	}, true, "backup.tar.gz")
	if err == nil {
		t.Fatal("expected path outside ALLOWED_LOCAL_DIRS to be rejected")
	}
}

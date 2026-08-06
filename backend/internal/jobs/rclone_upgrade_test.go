package jobs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureRcloneCompatibleRechecksReplacedBinary(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rclone")
	t.Setenv("RCLONE_PATH", path)
	writeUpgradeRclone(t, path, "1.51.0", "")

	_, version, err := EnsureRcloneCompatible(context.Background())
	if version != "rclone v1.51.0" {
		t.Fatalf("old version=%q, want rclone v1.51.0", version)
	}
	var incompatible *RcloneIncompatibleError
	if !errors.As(err, &incompatible) {
		t.Fatalf("error=%v, want RcloneIncompatibleError", err)
	}

	writeUpgradeRclone(t, path, "1.72.0", "# upgraded binary")
	_, version, err = EnsureRcloneCompatible(context.Background())
	if err != nil {
		t.Fatalf("EnsureRcloneCompatible() after replacement error=%v", err)
	}
	if version != "rclone v1.72.0" {
		t.Fatalf("new version=%q, want rclone v1.72.0", version)
	}
}

func writeUpgradeRclone(t *testing.T, path, version, marker string) {
	t.Helper()
	script := "#!/bin/sh\nset -eu\n" + marker + "\nprintf 'rclone v" + version + "\\n'\n"
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatalf("write rclone %s: %v", version, err)
	}
}

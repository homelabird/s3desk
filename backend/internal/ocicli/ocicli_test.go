package ocicli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveCLIPathUsesPATHWhenUnset(t *testing.T) {
	dir := t.TempDir()
	expected := writeTestExecutable(t, dir, "oci")
	t.Setenv("PATH", dir)
	t.Setenv("OCI_CLI_PATH", "")

	got, err := resolveCLIPath()
	if err != nil {
		t.Fatalf("resolveCLIPath: %v", err)
	}
	if got != expected {
		t.Fatalf("resolveCLIPath=%q, want %q", got, expected)
	}
}

func TestResolveCLIPathAllowsConfiguredExecutableName(t *testing.T) {
	dir := t.TempDir()
	expected := writeTestExecutable(t, dir, "oci-custom")
	t.Setenv("PATH", dir)
	t.Setenv("OCI_CLI_PATH", "oci-custom")

	got, err := resolveCLIPath()
	if err != nil {
		t.Fatalf("resolveCLIPath: %v", err)
	}
	if got != expected {
		t.Fatalf("resolveCLIPath=%q, want %q", got, expected)
	}
}

func TestResolveCLIPathAllowsAbsolutePath(t *testing.T) {
	dir := t.TempDir()
	expected := writeTestExecutable(t, dir, "oci")
	t.Setenv("OCI_CLI_PATH", expected)

	got, err := resolveCLIPath()
	if err != nil {
		t.Fatalf("resolveCLIPath: %v", err)
	}
	if got != expected {
		t.Fatalf("resolveCLIPath=%q, want %q", got, expected)
	}
}

func TestResolveCLIPathRejectsRelativeConfiguredPath(t *testing.T) {
	t.Setenv("OCI_CLI_PATH", "./oci")

	if _, err := resolveCLIPath(); err == nil {
		t.Fatal("resolveCLIPath succeeded, want error")
	}
}

func writeTestExecutable(t *testing.T, dir, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatalf("write executable: %v", err)
	}
	if err := os.Chmod(path, 0o700); err != nil {
		t.Fatalf("chmod executable: %v", err)
	}
	return path
}

package ocicli

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"s3desk/internal/models"
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

func TestGetBucketRejectsBlockedEndpointBeforeCLIResolution(t *testing.T) {
	t.Parallel()

	_, err := GetBucket(context.Background(), models.ProfileSecrets{
		Provider:     models.ProfileProviderOciObjectStorage,
		OciNamespace: "namespace",
		OciEndpoint:  "http://169.254.169.254/opc/v1",
	}, "bucket")
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("GetBucket err=%v, want blocked metadata host", err)
	}
}

func TestGetBucketWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := GetBucketWithOptions(context.Background(), models.ProfileSecrets{
		Provider:     models.ProfileProviderOciObjectStorage,
		OciNamespace: "namespace",
		OciEndpoint:  "http://127.0.0.1:8080/opc/v1",
	}, "bucket", ClientOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("GetBucketWithOptions err=%v, want loopback rejection", err)
	}
}

func TestGetBucketRejectsOversizedCLIStdout(t *testing.T) {
	prevStdoutLimit := ociCLIStdoutMaxBytes
	ociCLIStdoutMaxBytes = 32
	t.Cleanup(func() {
		ociCLIStdoutMaxBytes = prevStdoutLimit
	})

	dir := t.TempDir()
	body := strings.Repeat("x", int(ociCLIStdoutMaxBytes)+1)
	writeTestExecutableWithScript(t, dir, "oci", "#!/bin/sh\nprintf '"+body+"'\n")
	t.Setenv("PATH", dir)
	t.Setenv("OCI_CLI_PATH", "")

	_, err := GetBucket(context.Background(), models.ProfileSecrets{
		Provider:     models.ProfileProviderOciObjectStorage,
		OciNamespace: "namespace",
	}, "bucket")
	if err == nil || !strings.Contains(err.Error(), "oci cli output: stdout exceeds capture limit") {
		t.Fatalf("GetBucket err=%v, want stdout capture limit error", err)
	}
}

func writeTestExecutable(t *testing.T, dir, name string) string {
	t.Helper()
	return writeTestExecutableWithScript(t, dir, name, "#!/bin/sh\nexit 0\n")
}

func writeTestExecutableWithScript(t *testing.T, dir, name string, script string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatalf("write executable: %v", err)
	}
	if err := os.Chmod(path, 0o700); err != nil {
		t.Fatalf("chmod executable: %v", err)
	}
	return path
}

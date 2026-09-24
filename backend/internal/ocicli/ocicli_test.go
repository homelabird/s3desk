package ocicli

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
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

func TestListObjectsPageUsesSingleBoundedOCIPageAndMapsCursor(t *testing.T) {
	dir := t.TempDir()
	argsPath := filepath.Join(t.TempDir(), "args.txt")
	script := `#!/bin/sh
printf '%s\n' "$@" > "$OCI_TEST_ARGS"
printf '%s\n' '{"data":[{"name":"docs/a.txt","size":7,"etag":"etag","time-modified":"2026-09-01T12:00:00+00:00","storage-tier":"Standard"}],"prefixes":["docs/sub/"],"next-start-with":"opaque/+=="}'
`
	writeTestExecutableWithScript(t, dir, "oci", script)
	t.Setenv("PATH", dir)
	t.Setenv("OCI_CLI_PATH", "")
	t.Setenv("OCI_TEST_ARGS", argsPath)
	profile := models.ProfileSecrets{OciNamespace: "namespace", OciConfigFile: "/data/oci/config", OciConfigProfile: "S3Desk", OciAuthProvider: "instance_principal_auth", Region: "us-phoenix-1", OciEndpoint: "http://127.0.0.1:8080"}
	req := objectlisting.Request{Bucket: "bucket", Prefix: "docs/", Delimiter: "/", MaxKeys: 10}
	page, err := ListObjectsPage(context.Background(), profile, "bucket", req, ClientOptions{})
	if err != nil || !page.IsTruncated || page.NextToken != "opaque/+==" || len(page.Items) != 1 || len(page.CommonPrefixes) != 1 {
		t.Fatalf("page=%+v err=%v", page, err)
	}
	item := page.Items[0]
	if item.Key != "docs/a.txt" || item.Size != 7 || item.ETag != "etag" || item.LastModified != "2026-09-01T12:00:00Z" || item.StorageClass != "Standard" {
		t.Fatalf("item=%+v", item)
	}
	args, err := os.ReadFile(argsPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"--output\njson", "--no-retry", "--config-file\n/data/oci/config", "--profile\nS3Desk", "--region\nus-phoenix-1", "--endpoint\nhttp://127.0.0.1:8080", "--auth\ninstance_principal", "os\nobject\nlist", "--limit\n10", "--fields\nname,size,etag,timeModified,storageTier", "--prefix\ndocs/", "--delimiter\n/"} {
		if !strings.Contains(string(args), want) {
			t.Errorf("args %q do not contain %q", args, want)
		}
	}
	if strings.Contains(string(args), "--all") {
		t.Fatalf("OCI CLI must not eagerly fetch all pages: %q", args)
	}

	req.ContinuationToken = page.NextToken
	if _, err := ListObjectsPage(context.Background(), profile, "bucket", req, ClientOptions{}); err != nil {
		t.Fatal(err)
	}
	args, err = os.ReadFile(argsPath)
	if err != nil || !strings.Contains(string(args), "--start\nopaque/+==") {
		t.Fatalf("continuation args=%q err=%v", args, err)
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

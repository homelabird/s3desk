package api

import (
	"context"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestStartRcloneRejectsUnsafeProfileEndpointBeforeProcess(t *testing.T) {
	called := false
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		startRclone: func(*server, context.Context, models.ProfileSecrets, []string, string) (*rcloneProcess, error) {
			called = true
			return nil, nil
		},
	})
	t.Cleanup(restore)

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	_, err := srv.startRclone(context.Background(), unsafeRcloneEndpointProfile(), []string{"lsjson", "remote:"}, "guard")
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("startRclone err=%v, want blocked metadata host", err)
	}
	if called {
		t.Fatal("startRclone hook was called for unsafe endpoint")
	}
}

func TestRunRcloneStdinRejectsUnsafeProfileEndpointBeforeProcess(t *testing.T) {
	called := false
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		runRcloneStdin: func(*server, context.Context, models.ProfileSecrets, []string, string, io.Reader) (string, error) {
			called = true
			return "", nil
		},
	})
	t.Cleanup(restore)

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	_, err := srv.runRcloneStdin(context.Background(), unsafeRcloneEndpointProfile(), []string{"rcat", "remote:object"}, "guard", strings.NewReader("body"))
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("runRcloneStdin err=%v, want blocked metadata host", err)
	}
	if called {
		t.Fatal("runRcloneStdin hook was called for unsafe endpoint")
	}
}

func TestRunRcloneCaptureRejectsOversizedStdout(t *testing.T) {
	prevStdoutLimit := rcloneCaptureStdoutMaxBytes
	rcloneCaptureStdoutMaxBytes = 32
	t.Cleanup(func() {
		rcloneCaptureStdoutMaxBytes = prevStdoutLimit
	})

	body := strings.Repeat("x", int(rcloneCaptureStdoutMaxBytes)+1)
	rclonePath := writeAPIFakeRcloneScript(t, "#!/bin/sh\nprintf '"+body+"'\n")
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return rclonePath, "rclone v1.66.0", nil
	})

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	_, _, err := srv.runRcloneCapture(context.Background(), models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}, []string{"about", "remote:"}, "capture-limit")
	if err == nil || !strings.Contains(err.Error(), "rclone stdout exceeds capture limit") {
		t.Fatalf("runRcloneCapture err=%v, want stdout capture limit error", err)
	}
}

func TestRunRcloneCaptureInjectsGuardedProxyEnvironment(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("S3DESK_RCLONE_PROXY_ENV", filepath.Join(tempDir, "proxy"))
	t.Setenv("S3DESK_RCLONE_NO_PROXY_ENV", filepath.Join(tempDir, "no-proxy"))
	rclonePath := writeAPIFakeRcloneScript(t, "#!/bin/sh\nprintf '%s' \"$HTTP_PROXY\" > \"$S3DESK_RCLONE_PROXY_ENV\"\nprintf '%s' \"$NO_PROXY\" > \"$S3DESK_RCLONE_NO_PROXY_ENV\"\nprintf '[]'\n")
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return rclonePath, "rclone v1.66.0", nil
	})

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	out, _, err := srv.runRcloneCapture(context.Background(), models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}, []string{"about", "remote:"}, "proxy-env")
	if err != nil {
		t.Fatalf("runRcloneCapture: %v", err)
	}
	if out != "[]" {
		t.Fatalf("output=%q, want []", out)
	}
	proxyRaw, err := os.ReadFile(os.Getenv("S3DESK_RCLONE_PROXY_ENV"))
	if err != nil {
		t.Fatalf("read proxy environment: %v", err)
	}
	proxyURL, err := url.Parse(string(proxyRaw))
	if err != nil {
		t.Fatalf("parse proxy environment %q: %v", proxyRaw, err)
	}
	if proxyURL.Hostname() != "127.0.0.1" || proxyURL.User == nil {
		t.Fatalf("proxy URL=%q, want authenticated loopback URL", proxyURL)
	}
	noProxy, err := os.ReadFile(os.Getenv("S3DESK_RCLONE_NO_PROXY_ENV"))
	if err != nil {
		t.Fatalf("read no-proxy environment: %v", err)
	}
	if len(noProxy) != 0 {
		t.Fatalf("NO_PROXY=%q, want empty", noProxy)
	}
}

func TestStartRcloneCancellationTerminatesProcessGroup(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("process group tests use POSIX signals")
	}

	tempDir := t.TempDir()
	readyPath := filepath.Join(tempDir, "ready")
	markerPath := filepath.Join(tempDir, "terminated")
	t.Setenv("S3DESK_RCLONE_CHILD_READY", readyPath)
	t.Setenv("S3DESK_RCLONE_CHILD_MARKER", markerPath)
	rclonePath := writeAPIFakeRcloneScript(t, "#!/bin/sh\n(\n  trap 'printf done > \"$S3DESK_RCLONE_CHILD_MARKER\"; exit 0' TERM\n  : > \"$S3DESK_RCLONE_CHILD_READY\"\n  sleep 1\n) &\nchild=$!\ntrap ':' TERM\nwait \"$child\"\n")
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return rclonePath, "rclone v1.66.0", nil
	})

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	proc, err := srv.startRclone(ctx, models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}, []string{"about", "remote:"}, "process-group")
	if err != nil {
		t.Fatalf("startRclone: %v", err)
	}
	waitForAPIRcloneTestFile(t, readyPath)

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- proc.wait()
	}()
	cancel()
	select {
	case <-waitDone:
	case <-time.After(2 * time.Second):
		t.Fatal("rclone process group did not stop after cancellation")
	}
	waitForAPIRcloneTestFile(t, markerPath)
}

func TestRunRcloneStdinCancellationTerminatesProcessGroup(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("process group tests use POSIX signals")
	}

	tempDir := t.TempDir()
	readyPath := filepath.Join(tempDir, "ready")
	markerPath := filepath.Join(tempDir, "terminated")
	t.Setenv("S3DESK_RCLONE_CHILD_READY", readyPath)
	t.Setenv("S3DESK_RCLONE_CHILD_MARKER", markerPath)
	rclonePath := writeAPIFakeRcloneScript(t, "#!/bin/sh\n(\n  trap 'printf done > \"$S3DESK_RCLONE_CHILD_MARKER\"; exit 0' TERM\n  : > \"$S3DESK_RCLONE_CHILD_READY\"\n  sleep 1\n) &\nchild=$!\ntrap ':' TERM\nwait \"$child\"\n")
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return rclonePath, "rclone v1.66.0", nil
	})

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	done := make(chan error, 1)
	go func() {
		_, err := srv.runRcloneStdin(ctx, models.ProfileSecrets{
			Provider:        models.ProfileProviderS3Compatible,
			AccessKeyID:     "access",
			SecretAccessKey: "secret",
		}, []string{"rcat", "remote:object"}, "process-group-stdin", strings.NewReader("body"))
		done <- err
	}()
	waitForAPIRcloneTestFile(t, readyPath)

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("rclone stdin process group did not stop after cancellation")
	}
	waitForAPIRcloneTestFile(t, markerPath)
}

func unsafeRcloneEndpointProfile() models.ProfileSecrets {
	return models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        "http://169.254.169.254/latest/meta-data",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}
}

func writeAPIFakeRcloneScript(t *testing.T, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "rclone")
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatalf("write fake rclone: %v", err)
	}
	return path
}

func waitForAPIRcloneTestFile(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, err := os.Stat(path); err == nil {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", path)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

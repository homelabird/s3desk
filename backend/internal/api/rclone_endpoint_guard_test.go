package api

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

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

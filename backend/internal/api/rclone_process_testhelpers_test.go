package api

import (
	"context"
	"io"
	"strings"
	"testing"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
)

func installAPIRcloneCaptureHook(
	t *testing.T,
	hook func(args []string) (string, string, error),
) {
	t.Helper()
	prevCapture := runRcloneCaptureHook
	runRcloneCaptureHook = func(_ *server, _ context.Context, _ models.ProfileSecrets, args []string, _ string) (string, string, error) {
		return hook(args)
	}
	t.Cleanup(func() {
		runRcloneCaptureHook = prevCapture
	})
}

func installAPIStartRcloneHook(
	t *testing.T,
	hook func(secrets models.ProfileSecrets, args []string) (string, string, error),
) {
	t.Helper()
	prevStart := startRcloneHook
	startRcloneHook = func(_ *server, _ context.Context, secrets models.ProfileSecrets, args []string, _ string) (*rcloneProcess, error) {
		stdout, stderr, err := hook(secrets, args)
		if err != nil {
			return nil, err
		}
		return &rcloneProcess{
			stdout: io.NopCloser(strings.NewReader(stdout)),
			stderr: strings.NewReader(stderr),
			wait:   func() error { return nil },
		}, nil
	}
	t.Cleanup(func() {
		startRcloneHook = prevStart
	})
}

func installAPIRcloneStdinHook(
	t *testing.T,
	hook func(secrets models.ProfileSecrets, args []string, stdin io.Reader) (string, error),
) {
	t.Helper()
	prevStdin := runRcloneStdinHook
	runRcloneStdinHook = func(_ *server, _ context.Context, secrets models.ProfileSecrets, args []string, _ string, stdin io.Reader) (string, error) {
		return hook(secrets, args, stdin)
	}
	t.Cleanup(func() {
		runRcloneStdinHook = prevStdin
	})
}

func installJobsEnsureRcloneHook(
	t *testing.T,
	ensure func(context.Context) (string, string, error),
) {
	t.Helper()
	restore := jobs.SetProcessTestHooks(ensure, nil)
	t.Cleanup(restore)
}

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
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		runRcloneCapture: func(_ *server, _ context.Context, _ models.ProfileSecrets, args []string, _ string) (string, string, error) {
			return hook(args)
		},
	})
	t.Cleanup(restore)
}

func installAPIStartRcloneHook(
	t *testing.T,
	hook func(secrets models.ProfileSecrets, args []string) (string, string, error),
) {
	t.Helper()
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		startRclone: func(_ *server, _ context.Context, secrets models.ProfileSecrets, args []string, _ string) (*rcloneProcess, error) {
			stdout, stderr, err := hook(secrets, args)
			if err != nil {
				return nil, err
			}
			return &rcloneProcess{
				stdout: io.NopCloser(strings.NewReader(stdout)),
				stderr: strings.NewReader(stderr),
				wait:   func() error { return nil },
			}, nil
		},
	})
	t.Cleanup(restore)
}

func installAPIRcloneStdinHook(
	t *testing.T,
	hook func(secrets models.ProfileSecrets, args []string, stdin io.Reader) (string, error),
) {
	t.Helper()
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		runRcloneStdin: func(_ *server, _ context.Context, secrets models.ProfileSecrets, args []string, _ string, stdin io.Reader) (string, error) {
			return hook(secrets, args, stdin)
		},
	})
	t.Cleanup(restore)
}

func installJobsEnsureRcloneHook(
	t *testing.T,
	ensure func(context.Context) (string, string, error),
) {
	t.Helper()
	restore := jobs.SetProcessTestHooks(ensure, nil)
	t.Cleanup(restore)
}

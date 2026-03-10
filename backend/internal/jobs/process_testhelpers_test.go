package jobs

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func installJobsProcessHooks(
	t *testing.T,
	runAttempt func(context.Context, string, []string, string, TestRunRcloneAttemptOptions, func(level string, message string)) (string, error),
) {
	t.Helper()
	restore := SetProcessTestHooks(
		func(context.Context) (string, string, error) {
			return "rclone", "rclone v1.66.0", nil
		},
		runAttempt,
	)
	t.Cleanup(restore)
}

func unexpectedJobsProcessArgs(args []string) error {
	return errors.New("unexpected rclone args: " + strings.Join(args, " "))
}

func installJobsStartRcloneHook(
	t *testing.T,
	start func(context.Context, models.ProfileSecrets, string, []string) (*rcloneProcess, error),
) {
	t.Helper()
	restore := setProcessTestHooks(processTestHooks{
		startRcloneCommand: start,
	})
	t.Cleanup(restore)
}

func newTestRcloneProcess(stdout, stderr string, waitErr error) *rcloneProcess {
	return &rcloneProcess{
		stdout: io.NopCloser(strings.NewReader(stdout)),
		stderr: bytes.NewBufferString(stderr),
		wait:   func() error { return waitErr },
	}
}

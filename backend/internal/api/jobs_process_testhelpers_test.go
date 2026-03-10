package api

import (
	"context"
	"errors"
	"testing"

	"s3desk/internal/jobs"
)

func installJobsProcessHooks(
	t *testing.T,
	runAttempt func(context.Context, string, []string, string, jobs.TestRunRcloneAttemptOptions, func(level string, message string)) (string, error),
) {
	t.Helper()
	restore := jobs.SetProcessTestHooks(
		func(context.Context) (string, string, error) {
			return "rclone", "rclone v1.66.0", nil
		},
		runAttempt,
	)
	t.Cleanup(restore)
}

func unexpectedRcloneAttemptError(args []string) error {
	return errors.New("unexpected rclone args: " + joinArgs(args))
}

func joinArgs(args []string) string {
	if len(args) == 0 {
		return ""
	}
	out := args[0]
	for i := 1; i < len(args); i++ {
		out += " " + args[i]
	}
	return out
}

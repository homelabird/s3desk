package jobs

import (
	"context"

	"s3desk/internal/models"
)

type TestRunRcloneAttemptOptions struct {
	TrackProgress bool
	DryRun        bool
}

var (
	testEnsureRcloneCompatibleHook func(context.Context) (string, string, error)
	testStartRcloneCommandHook     func(context.Context, models.ProfileSecrets, string, []string) (*rcloneProcess, error)
	testRunRcloneAttemptHook       func(context.Context, string, []string, string, TestRunRcloneAttemptOptions, func(level string, message string)) (string, error)
)

func SetProcessTestHooks(
	ensure func(context.Context) (string, string, error),
	runAttempt func(context.Context, string, []string, string, TestRunRcloneAttemptOptions, func(level string, message string)) (string, error),
) func() {
	prevEnsure := testEnsureRcloneCompatibleHook
	prevRunAttempt := testRunRcloneAttemptHook

	testEnsureRcloneCompatibleHook = ensure
	testRunRcloneAttemptHook = runAttempt

	return func() {
		testEnsureRcloneCompatibleHook = prevEnsure
		testRunRcloneAttemptHook = prevRunAttempt
	}
}

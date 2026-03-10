package jobs

import (
	"context"
	"sync"

	"s3desk/internal/models"
)

type TestRunRcloneAttemptOptions struct {
	TrackProgress bool
	DryRun        bool
}

type processTestHooks struct {
	ensureRcloneCompatible func(context.Context) (string, string, error)
	startRcloneCommand     func(context.Context, models.ProfileSecrets, string, []string) (*rcloneProcess, error)
	runRcloneAttempt       func(context.Context, string, []string, string, TestRunRcloneAttemptOptions, func(level string, message string)) (string, error)
}

var (
	processHooksMu    sync.RWMutex
	processInstallMu  sync.Mutex
	processHooksState processTestHooks
)

func currentProcessTestHooks() processTestHooks {
	processHooksMu.RLock()
	defer processHooksMu.RUnlock()
	return processHooksState
}

func setProcessTestHooks(hooks processTestHooks) func() {
	processInstallMu.Lock()
	processHooksMu.Lock()
	prev := processHooksState
	processHooksState = hooks
	processHooksMu.Unlock()

	return func() {
		processHooksMu.Lock()
		processHooksState = prev
		processHooksMu.Unlock()
		processInstallMu.Unlock()
	}
}

func SetProcessTestHooks(
	ensure func(context.Context) (string, string, error),
	runAttempt func(context.Context, string, []string, string, TestRunRcloneAttemptOptions, func(level string, message string)) (string, error),
) func() {
	current := currentProcessTestHooks()
	current.ensureRcloneCompatible = ensure
	current.runRcloneAttempt = runAttempt
	return setProcessTestHooks(current)
}

package api

import (
	"context"
	"image"
	"io"
	"sync"

	"s3desk/internal/models"
)

type apiProcessTestHooks struct {
	startRclone              func(*server, context.Context, models.ProfileSecrets, []string, string) (*rcloneProcess, error)
	runRcloneCapture         func(*server, context.Context, models.ProfileSecrets, []string, string) (string, string, error)
	runRcloneStdin           func(*server, context.Context, models.ProfileSecrets, []string, string, io.Reader) (string, error)
	resolveFFmpegPath        func() (string, error)
	decodeThumbnailVideo     func(context.Context, string, io.Reader) (image.Image, error)
	decodeThumbnailVideoFile func(context.Context, string, string) (image.Image, error)
}

var (
	apiProcessHooksMu    sync.RWMutex
	apiProcessHooksState apiProcessTestHooks
)

func currentAPIProcessTestHooks() apiProcessTestHooks {
	apiProcessHooksMu.RLock()
	defer apiProcessHooksMu.RUnlock()
	return apiProcessHooksState
}

func setAPIProcessTestHooks(hooks apiProcessTestHooks) func() {
	apiProcessHooksMu.Lock()
	prev := apiProcessHooksState
	apiProcessHooksState = hooks
	apiProcessHooksMu.Unlock()

	return func() {
		apiProcessHooksMu.Lock()
		apiProcessHooksState = prev
		apiProcessHooksMu.Unlock()
	}
}

package api

import (
	"context"
	"image"
	"io"

	"s3desk/internal/models"
)

var (
	startRcloneHook              func(*server, context.Context, models.ProfileSecrets, []string, string) (*rcloneProcess, error)
	runRcloneCaptureHook         func(*server, context.Context, models.ProfileSecrets, []string, string) (string, string, error)
	runRcloneStdinHook           func(*server, context.Context, models.ProfileSecrets, []string, string, io.Reader) (string, error)
	resolveFFmpegPathHook        func() (string, error)
	decodeThumbnailVideoHook     func(context.Context, string, io.Reader) (image.Image, error)
	decodeThumbnailVideoFileHook func(context.Context, string, string) (image.Image, error)
)

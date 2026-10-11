package jobs

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/metrics"
	"s3desk/internal/models"
	"s3desk/internal/s3client"
)

func s3ClientFromProfile(ctx context.Context, secrets models.ProfileSecrets, allowRemote bool, m *metrics.Metrics) (*s3.Client, error) {
	return s3client.FromProfileWithOptionsContext(ctx, secrets, s3client.ProfileOptions{AllowRemote: allowRemote, Metrics: m})
}

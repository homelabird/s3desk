package jobs

import (
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/s3client"
)

func s3ClientFromProfile(secrets models.ProfileSecrets, allowRemote bool) (*s3.Client, error) {
	return s3client.FromProfileWithOptions(secrets, s3client.ProfileOptions{AllowRemote: allowRemote})
}

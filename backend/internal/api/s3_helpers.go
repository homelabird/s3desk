package api

import (
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/s3client"
)

func s3ClientFromProfile(secrets models.ProfileSecrets) (*s3.Client, error) {
	return s3client.FromProfile(secrets)
}

func s3PresignClientFromProfile(secrets models.ProfileSecrets) (*s3.PresignClient, error) {
	return s3client.PresignFromProfile(secrets)
}

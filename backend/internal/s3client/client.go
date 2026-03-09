package s3client

import (
	"crypto/tls"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
)

func FromProfile(secrets models.ProfileSecrets) *s3.Client {
	return fromProfileWithEndpoint(secrets, strings.TrimSpace(secrets.Endpoint))
}

func PresignFromProfile(secrets models.ProfileSecrets) *s3.PresignClient {
	endpoint := strings.TrimSpace(secrets.PublicEndpoint)
	if endpoint == "" {
		endpoint = strings.TrimSpace(secrets.Endpoint)
	}
	return s3.NewPresignClient(fromProfileWithEndpoint(secrets, endpoint))
}

func fromProfileWithEndpoint(secrets models.ProfileSecrets, endpoint string) *s3.Client {
	region := strings.TrimSpace(secrets.Region)
	if region == "" {
		region = "us-east-1"
	}

	cfg := aws.Config{
		Region:      region,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(secrets.AccessKeyID, secrets.SecretAccessKey, derefString(secrets.SessionToken))),
	}

	if secrets.TLSInsecureSkipVerify {
		cfg.HTTPClient = &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
	}

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = secrets.ForcePathStyle
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
	})
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

package jobs

import (
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/profiletls"
)

func s3ClientFromProfile(secrets models.ProfileSecrets) (*s3.Client, error) {
	region := strings.TrimSpace(secrets.Region)
	if region == "" {
		region = "us-east-1"
	}

	cfg := aws.Config{
		Region: region,
		Credentials: aws.NewCredentialsCache(
			credentials.NewStaticCredentialsProvider(
				secrets.AccessKeyID,
				secrets.SecretAccessKey,
				derefString(secrets.SessionToken),
			),
		),
	}

	endpoint := strings.TrimSpace(secrets.Endpoint)
	tlsCfg, err := profiletls.BuildConfig(secrets)
	if err != nil {
		return nil, err
	}
	if tlsCfg != nil {
		cfg.HTTPClient = &http.Client{
			Transport: func() *http.Transport {
				transport := http.DefaultTransport.(*http.Transport).Clone()
				transport.TLSClientConfig = tlsCfg
				return transport
			}(),
		}
	}

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = secrets.ForcePathStyle
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
	}), nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

package api

import (
	"crypto/tls"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
)

func s3ClientFromProfile(secrets models.ProfileSecrets) (*s3.Client, error) {
	region := strings.TrimSpace(secrets.Region)
	if region == "" {
		region = "us-east-1"
	}
	cfg := aws.Config{
		Region:      region,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(secrets.AccessKeyID, secrets.SecretAccessKey, derefString(secrets.SessionToken))),
	}

	endpoint := strings.TrimSpace(secrets.Endpoint)
	if endpoint != "" {
		cfg.EndpointResolverWithOptions = aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...any) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:               endpoint,
				HostnameImmutable: true,
			}, nil
		})
	}

	if secrets.TLSInsecureSkipVerify {
		transport := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		cfg.HTTPClient = &http.Client{Transport: transport}
	}

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = secrets.ForcePathStyle
	}), nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

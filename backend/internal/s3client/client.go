package s3client

import (
	"crypto/tls"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/profiletls"
)

func FromProfile(secrets models.ProfileSecrets) (*s3.Client, error) {
	return fromProfileWithEndpoint(secrets, strings.TrimSpace(secrets.Endpoint))
}

func PresignFromProfile(secrets models.ProfileSecrets) (*s3.PresignClient, error) {
	endpoint := strings.TrimSpace(secrets.PublicEndpoint)
	if endpoint == "" {
		endpoint = strings.TrimSpace(secrets.Endpoint)
	}
	client, err := fromProfileWithEndpoint(secrets, endpoint)
	if err != nil {
		return nil, err
	}
	return s3.NewPresignClient(client), nil
}

func fromProfileWithEndpoint(secrets models.ProfileSecrets, endpoint string) (*s3.Client, error) {
	region := strings.TrimSpace(secrets.Region)
	if region == "" {
		region = "us-east-1"
	}

	cfg := aws.Config{
		Region:      region,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(secrets.AccessKeyID, secrets.SecretAccessKey, derefString(secrets.SessionToken))),
	}

	tlsCfg, err := profiletls.BuildConfig(secrets)
	if err != nil {
		return nil, err
	}
	if tlsCfg != nil {
		cfg.HTTPClient = newHTTPClient(tlsCfg)
	}

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = secrets.ForcePathStyle
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
	}), nil
}

func newHTTPClient(tlsCfg *tls.Config) *http.Client {
	if transport, ok := http.DefaultTransport.(*http.Transport); ok {
		cloned := transport.Clone()
		cloned.TLSClientConfig = tlsCfg
		return &http.Client{Transport: cloned}
	}
	return &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
	}
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

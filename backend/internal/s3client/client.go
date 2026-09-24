package s3client

import (
	"crypto/tls"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/metrics"
	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
	"s3desk/internal/profilehttp"
)

type ProfileOptions struct {
	AllowRemote bool
	Metrics     *metrics.Metrics
}

func FromProfile(secrets models.ProfileSecrets) (*s3.Client, error) {
	return FromProfileWithOptions(secrets, ProfileOptions{})
}

func FromProfileWithOptions(secrets models.ProfileSecrets, opts ProfileOptions) (*s3.Client, error) {
	if err := profileendpoint.ValidateProfileSecretsEndpoints(secrets, opts.AllowRemote); err != nil {
		return nil, err
	}
	return fromProfileWithEndpoint(secrets, strings.TrimSpace(secrets.Endpoint), opts)
}

func PresignFromProfile(secrets models.ProfileSecrets) (*s3.PresignClient, error) {
	return PresignFromProfileWithOptions(secrets, ProfileOptions{})
}

func PresignFromProfileWithOptions(secrets models.ProfileSecrets, opts ProfileOptions) (*s3.PresignClient, error) {
	if err := profileendpoint.ValidateProfileSecretsEndpoints(secrets, opts.AllowRemote); err != nil {
		return nil, err
	}
	endpoint := strings.TrimSpace(secrets.PublicEndpoint)
	if endpoint == "" {
		endpoint = strings.TrimSpace(secrets.Endpoint)
	}
	client, err := fromProfileWithEndpoint(secrets, endpoint, opts)
	if err != nil {
		return nil, err
	}
	return s3.NewPresignClient(client), nil
}

func fromProfileWithEndpoint(secrets models.ProfileSecrets, endpoint string, opts ProfileOptions) (*s3.Client, error) {
	region := strings.TrimSpace(secrets.Region)
	if region == "" {
		region = "us-east-1"
	}

	cfg := aws.Config{
		Region:      region,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(secrets.AccessKeyID, secrets.SecretAccessKey, derefString(secrets.SessionToken))),
	}
	if opts.Metrics != nil {
		cfg.Retryer = func() aws.Retryer {
			return observedRetryer{Retryer: retry.NewStandard(), onRetry: func() {
				opts.Metrics.IncStorageAPIRetryScheduled(string(secrets.Provider))
			}}
		}
	}

	httpClient, err := profilehttp.Client(secrets, opts.AllowRemote)
	if err != nil {
		return nil, err
	}
	cfg.HTTPClient = httpClient

	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = secrets.ForcePathStyle
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
	}), nil
}

type observedRetryer struct {
	aws.Retryer
	onRetry func()
}

func (r observedRetryer) RetryDelay(attempt int, err error) (time.Duration, error) {
	delay, retryErr := r.Retryer.RetryDelay(attempt, err)
	if retryErr == nil && r.onRetry != nil {
		r.onRetry()
	}
	return delay, retryErr
}

func newHTTPClient(tlsCfg *tls.Config, allowRemote bool) *http.Client {
	return profileendpoint.NewHTTPClient(profileendpoint.HTTPClientOptions{
		AllowRemote: allowRemote,
		TLSConfig:   tlsCfg,
	})
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

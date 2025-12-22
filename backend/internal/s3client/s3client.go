package s3client

import (
	"context"
	"crypto/tls"
	"errors"
	"net/http"
	"net/url"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"object-storage/internal/models"
)

func New(ctx context.Context, p models.ProfileSecrets) (*s3.Client, error) {
	if p.Region == "" {
		return nil, errors.New("region is required")
	}
	if p.Endpoint != "" {
		if _, err := url.Parse(p.Endpoint); err != nil {
			return nil, err
		}
	}

	var httpClient aws.HTTPClient
	if p.TLSInsecureSkipVerify {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
		httpClient = &http.Client{Transport: transport}
	}

	resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...any) (aws.Endpoint, error) {
		if service == s3.ServiceID && p.Endpoint != "" {
			return aws.Endpoint{
				URL:               p.Endpoint,
				SigningRegion:     p.Region,
				HostnameImmutable: true,
			}, nil
		}
		return aws.Endpoint{}, &aws.EndpointNotFoundError{}
	})

	loadOptions := []func(*config.LoadOptions) error{
		config.WithRegion(p.Region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(p.AccessKeyID, p.SecretAccessKey, stringOrEmpty(p.SessionToken))),
		config.WithEndpointResolverWithOptions(resolver),
	}
	if httpClient != nil {
		loadOptions = append(loadOptions, config.WithHTTPClient(httpClient))
	}

	cfg, err := config.LoadDefaultConfig(ctx, loadOptions...)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = p.ForcePathStyle
	})
	return client, nil
}

func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

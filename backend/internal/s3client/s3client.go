package s3client

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
)

type cachedTLSMaterial struct {
	updatedAt  string
	cert       tls.Certificate
	roots      *x509.CertPool
	serverName string
}

var tlsMaterialCache = struct {
	mu      sync.Mutex
	entries map[string]cachedTLSMaterial
}{
	entries: make(map[string]cachedTLSMaterial),
}

const (
	s3DialTimeout           = 10 * time.Second
	s3KeepAlive             = 30 * time.Second
	s3TLSHandshakeTimeout   = 10 * time.Second
	s3ResponseHeaderTimeout = 30 * time.Second
	s3IdleConnTimeout       = 90 * time.Second
	s3MaxIdleConns          = 100
	s3MaxIdleConnsPerHost   = 20
	s3ExpectContinueTimeout = 1 * time.Second
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

	tlsConfig, err := buildTLSConfig(p)
	if err != nil {
		return nil, err
	}
	httpClient := newHTTPClient(tlsConfig)

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
	loadOptions = append(loadOptions, config.WithHTTPClient(httpClient))

	cfg, err := config.LoadDefaultConfig(ctx, loadOptions...)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = p.ForcePathStyle
	})
	return client, nil
}

func newHTTPClient(tlsConfig *tls.Config) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = tlsConfig
	transport.DialContext = (&net.Dialer{
		Timeout:   s3DialTimeout,
		KeepAlive: s3KeepAlive,
	}).DialContext
	transport.TLSHandshakeTimeout = s3TLSHandshakeTimeout
	transport.ResponseHeaderTimeout = s3ResponseHeaderTimeout
	transport.IdleConnTimeout = s3IdleConnTimeout
	transport.MaxIdleConns = s3MaxIdleConns
	transport.MaxIdleConnsPerHost = s3MaxIdleConnsPerHost
	transport.ExpectContinueTimeout = s3ExpectContinueTimeout

	return &http.Client{Transport: transport}
}

func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func buildTLSConfig(p models.ProfileSecrets) (*tls.Config, error) {
	if p.TLSConfig == nil && !p.TLSInsecureSkipVerify {
		return nil, nil
	}

	mode := models.ProfileTLSModeDisabled
	if p.TLSConfig != nil {
		mode = normalizeTLSMode(p.TLSConfig.Mode)
	}
	if mode == models.ProfileTLSModeDisabled && !p.TLSInsecureSkipVerify {
		return nil, nil
	}

	cfg := &tls.Config{InsecureSkipVerify: p.TLSInsecureSkipVerify} //nolint:gosec
	if p.TLSConfig == nil || mode == models.ProfileTLSModeDisabled {
		return cfg, nil
	}
	if mode != models.ProfileTLSModeMTLS {
		return nil, fmt.Errorf("unsupported tls mode: %s", mode)
	}

	material, err := resolveTLSMaterial(p.ID, p.TLSConfigUpdatedAt, *p.TLSConfig)
	if err != nil {
		return nil, err
	}
	cfg.Certificates = []tls.Certificate{material.cert}
	if material.roots != nil {
		cfg.RootCAs = material.roots
	}
	if material.serverName != "" {
		cfg.ServerName = material.serverName
	}
	return cfg, nil
}

func normalizeTLSMode(mode models.ProfileTLSMode) models.ProfileTLSMode {
	raw := strings.ToLower(strings.TrimSpace(string(mode)))
	switch raw {
	case "", "disabled":
		return models.ProfileTLSModeDisabled
	case "mtls":
		return models.ProfileTLSModeMTLS
	default:
		return models.ProfileTLSMode(raw)
	}
}

func resolveTLSMaterial(profileID, updatedAt string, cfg models.ProfileTLSConfig) (cachedTLSMaterial, error) {
	if profileID != "" && updatedAt != "" {
		if cached, ok := getCachedTLSMaterial(profileID, updatedAt); ok {
			return cached, nil
		}
	}

	certPEM := strings.TrimSpace(cfg.ClientCertPEM)
	keyPEM := strings.TrimSpace(cfg.ClientKeyPEM)
	if certPEM == "" || keyPEM == "" {
		return cachedTLSMaterial{}, errors.New("mtls requires client certificate and key")
	}
	cert, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
	if err != nil {
		return cachedTLSMaterial{}, err
	}

	var roots *x509.CertPool
	caPEM := strings.TrimSpace(cfg.CACertPEM)
	if caPEM != "" {
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return cachedTLSMaterial{}, errors.New("invalid CA certificate")
		}
		roots = pool
	}

	entry := cachedTLSMaterial{
		updatedAt:  updatedAt,
		cert:       cert,
		roots:      roots,
		serverName: strings.TrimSpace(cfg.ServerName),
	}
	if profileID != "" && updatedAt != "" {
		setCachedTLSMaterial(profileID, entry)
	}
	return entry, nil
}

func getCachedTLSMaterial(profileID, updatedAt string) (cachedTLSMaterial, bool) {
	tlsMaterialCache.mu.Lock()
	defer tlsMaterialCache.mu.Unlock()
	entry, ok := tlsMaterialCache.entries[profileID]
	if !ok || entry.updatedAt != updatedAt {
		return cachedTLSMaterial{}, false
	}
	return entry, true
}

func setCachedTLSMaterial(profileID string, entry cachedTLSMaterial) {
	tlsMaterialCache.mu.Lock()
	tlsMaterialCache.entries[profileID] = entry
	tlsMaterialCache.mu.Unlock()
}

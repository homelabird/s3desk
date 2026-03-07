package profiletls

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"strings"

	"s3desk/internal/models"
)

func BuildConfig(profile models.ProfileSecrets) (*tls.Config, error) {
	if !profile.TLSInsecureSkipVerify && profile.TLSConfig == nil {
		return nil, nil
	}

	cfg := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}
	if profile.TLSInsecureSkipVerify {
		cfg.InsecureSkipVerify = true //nolint:gosec
	}
	if profile.TLSConfig == nil {
		return cfg, nil
	}

	mode := strings.ToLower(strings.TrimSpace(string(profile.TLSConfig.Mode)))
	if mode == "" || mode == string(models.ProfileTLSModeDisabled) {
		return cfg, nil
	}
	if mode != string(models.ProfileTLSModeMTLS) {
		return nil, fmt.Errorf("unsupported tls mode: %s", mode)
	}

	certPEM := strings.TrimSpace(profile.TLSConfig.ClientCertPEM)
	keyPEM := strings.TrimSpace(profile.TLSConfig.ClientKeyPEM)
	if certPEM == "" || keyPEM == "" {
		return nil, errors.New("mtls requires client certificate and key")
	}
	cert, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
	if err != nil {
		return nil, err
	}
	cfg.Certificates = []tls.Certificate{cert}

	if caPEM := strings.TrimSpace(profile.TLSConfig.CACertPEM); caPEM != "" {
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return nil, errors.New("failed to parse ca certificate")
		}
		cfg.RootCAs = pool
	}

	return cfg, nil
}

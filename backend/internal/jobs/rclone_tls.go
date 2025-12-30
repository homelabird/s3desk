package jobs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"s3desk/internal/models"
)

// PrepareRcloneTLSFlags returns rclone TLS flags plus a cleanup function for temp files.
// It mirrors profile TLS settings and lets callers reuse the logic for API and jobs.
func PrepareRcloneTLSFlags(profile models.ProfileSecrets) (flags []string, cleanup func(), err error) {
	cleanup = func() {}

	if profile.TLSInsecureSkipVerify {
		flags = append(flags, "--no-check-certificate")
	}
	if profile.TLSConfig == nil {
		return flags, cleanup, nil
	}

	mode := normalizeTLSMode(profile.TLSConfig.Mode)
	if mode == models.ProfileTLSModeDisabled {
		return flags, cleanup, nil
	}
	if mode != models.ProfileTLSModeMTLS {
		return nil, cleanup, fmt.Errorf("unsupported tls mode: %s", mode)
	}

	certPEM := strings.TrimSpace(profile.TLSConfig.ClientCertPEM)
	keyPEM := strings.TrimSpace(profile.TLSConfig.ClientKeyPEM)
	if certPEM == "" || keyPEM == "" {
		return nil, cleanup, fmt.Errorf("mtls requires client certificate and key")
	}

	dir, err := os.MkdirTemp("", "rclone-tls-")
	if err != nil {
		return nil, cleanup, err
	}
	cleanup = func() { _ = os.RemoveAll(dir) }

	certPath := filepath.Join(dir, "client-cert.pem")
	if err := os.WriteFile(certPath, []byte(certPEM), 0o600); err != nil {
		cleanup()
		return nil, func() {}, err
	}
	keyPath := filepath.Join(dir, "client-key.pem")
	if err := os.WriteFile(keyPath, []byte(keyPEM), 0o600); err != nil {
		cleanup()
		return nil, func() {}, err
	}

	flags = append(flags, "--client-cert", certPath, "--client-key", keyPath)

	if caPEM := strings.TrimSpace(profile.TLSConfig.CACertPEM); caPEM != "" {
		caPath := filepath.Join(dir, "ca.pem")
		if err := os.WriteFile(caPath, []byte(caPEM), 0o600); err != nil {
			cleanup()
			return nil, func() {}, err
		}
		flags = append(flags, "--ca-cert", caPath)
	}

	return flags, cleanup, nil
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

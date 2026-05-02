package profiletls

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"os"
	"strings"

	"s3desk/internal/logging"
	"s3desk/internal/models"
)

const TLSSkipVerifyApprovalEnv = "S3DESK_ALLOW_INSECURE_TLS_SKIP_VERIFY"

// BuildConfig translates stored profile TLS settings into a tls.Config.
func BuildConfig(profile models.ProfileSecrets) (*tls.Config, error) {
	if !profile.TLSInsecureSkipVerify && profile.TLSConfig == nil {
		return nil, nil
	}

	cfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if profile.TLSInsecureSkipVerify {
		if err := ValidateSkipVerifyPolicy(); err != nil {
			return nil, err
		}
		LogSkipVerifyApplied("profile.tls_skip_verify", profile)
		cfg.InsecureSkipVerify = true //nolint:gosec
	}
	if profile.TLSConfig == nil {
		return cfg, nil
	}

	mode := NormalizeMode(profile.TLSConfig.Mode)
	if mode == models.ProfileTLSModeDisabled {
		return cfg, nil
	}
	if mode != models.ProfileTLSModeMTLS {
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

func ValidateSkipVerifyPolicy() error {
	runtimeEnv := NormalizedRuntimeEnv()
	if IsProductionRuntimeEnv(runtimeEnv) && !SkipVerifyApproved() {
		return fmt.Errorf("tlsInsecureSkipVerify requires %s=true when LOG_ENV=%s", TLSSkipVerifyApprovalEnv, runtimeEnv)
	}
	return nil
}

func NormalizedRuntimeEnv() string {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_ENV")))
	if env == "" {
		return "local"
	}
	return env
}

func IsProductionRuntimeEnv(runtimeEnv string) bool {
	switch strings.ToLower(strings.TrimSpace(runtimeEnv)) {
	case "prod", "production":
		return true
	default:
		return false
	}
}

func SkipVerifyApproved() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(TLSSkipVerifyApprovalEnv))) {
	case "1", "true", "yes", "approved":
		return true
	default:
		return false
	}
}

func LogSkipVerifyApplied(event string, profile models.ProfileSecrets) {
	fields := map[string]any{
		"event":        event,
		"profile_id":   profile.ID,
		"provider":     string(profile.Provider),
		"risk":         "high",
		"runtime_env":  NormalizedRuntimeEnv(),
		"approval_env": TLSSkipVerifyApprovalEnv,
		"approved":     SkipVerifyApproved(),
	}
	logging.WarnFields("TLS certificate verification disabled", fields)
}

func NormalizeMode(mode models.ProfileTLSMode) models.ProfileTLSMode {
	raw := strings.ToLower(strings.TrimSpace(string(mode)))
	switch raw {
	case "", string(models.ProfileTLSModeDisabled):
		return models.ProfileTLSModeDisabled
	case string(models.ProfileTLSModeMTLS):
		return models.ProfileTLSModeMTLS
	default:
		return models.ProfileTLSMode(raw)
	}
}

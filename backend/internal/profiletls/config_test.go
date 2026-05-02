package profiletls

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"io"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"

	"s3desk/internal/logging"
	"s3desk/internal/models"
)

func TestBuildConfigWithoutTLSSettingsReturnsNil(t *testing.T) {
	t.Parallel()

	cfg, err := BuildConfig(models.ProfileSecrets{})
	if err != nil {
		t.Fatalf("BuildConfig err=%v", err)
	}
	if cfg != nil {
		t.Fatalf("BuildConfig cfg=%+v, want nil", cfg)
	}
}

func TestBuildConfigDisabledModeKeepsTLSDefaults(t *testing.T) {
	t.Parallel()

	cfg, err := BuildConfig(models.ProfileSecrets{
		TLSConfig: &models.ProfileTLSConfig{Mode: models.ProfileTLSModeDisabled},
	})
	if err != nil {
		t.Fatalf("BuildConfig err=%v", err)
	}
	if cfg == nil {
		t.Fatal("BuildConfig returned nil config")
	}
	if cfg.MinVersion != tls.VersionTLS12 {
		t.Fatalf("cfg.MinVersion=%v, want %v", cfg.MinVersion, tls.VersionTLS12)
	}
}

func TestBuildConfigWithMTLSAndCA(t *testing.T) {
	t.Parallel()

	certPEM, keyPEM := generateTLSMaterials(t)
	cfg, err := BuildConfig(models.ProfileSecrets{
		TLSConfig: &models.ProfileTLSConfig{
			Mode:          models.ProfileTLSModeMTLS,
			ClientCertPEM: certPEM,
			ClientKeyPEM:  keyPEM,
			CACertPEM:     certPEM,
		},
	})
	if err != nil {
		t.Fatalf("BuildConfig err=%v", err)
	}
	if cfg == nil {
		t.Fatal("BuildConfig returned nil config")
	}
	if len(cfg.Certificates) != 1 {
		t.Fatalf("len(cfg.Certificates)=%d, want 1", len(cfg.Certificates))
	}
	if cfg.RootCAs == nil {
		t.Fatalf("cfg.RootCAs=%v, want populated root CAs", cfg.RootCAs)
	}
}

func TestBuildConfigRejectsMissingClientKey(t *testing.T) {
	t.Parallel()

	certPEM, _ := generateTLSMaterials(t)
	cfg, err := BuildConfig(models.ProfileSecrets{
		TLSConfig: &models.ProfileTLSConfig{
			Mode:          models.ProfileTLSModeMTLS,
			ClientCertPEM: certPEM,
		},
	})
	if err == nil {
		t.Fatalf("BuildConfig cfg=%+v, want error", cfg)
	}
}

func TestBuildConfigRejectsSkipVerifyInProductionWithoutApproval(t *testing.T) {
	t.Setenv("LOG_ENV", "production")
	t.Setenv(TLSSkipVerifyApprovalEnv, "")

	cfg, err := BuildConfig(models.ProfileSecrets{
		ID:                    "profile-prod",
		Provider:              models.ProfileProviderS3Compatible,
		TLSInsecureSkipVerify: true,
	})
	if err == nil {
		t.Fatalf("BuildConfig cfg=%+v, want error", cfg)
	}
	if !strings.Contains(err.Error(), TLSSkipVerifyApprovalEnv) {
		t.Fatalf("err=%v, want approval env mention", err)
	}
}

func TestBuildConfigAllowsSkipVerifyInProductionWithApprovalAndLogs(t *testing.T) {
	t.Setenv("LOG_ENV", "production")
	t.Setenv(TLSSkipVerifyApprovalEnv, "true")

	output := captureProfileTLSLogOutput(t, func() {
		cfg, err := BuildConfig(models.ProfileSecrets{
			ID:                    "profile-prod-approved",
			Provider:              models.ProfileProviderS3Compatible,
			TLSInsecureSkipVerify: true,
		})
		if err != nil {
			t.Fatalf("BuildConfig err=%v", err)
		}
		if cfg == nil || !cfg.InsecureSkipVerify {
			t.Fatalf("cfg=%+v, want InsecureSkipVerify", cfg)
		}
	})

	for _, want := range []string{"profile.tls_skip_verify", TLSSkipVerifyApprovalEnv, "production"} {
		if !strings.Contains(output, want) {
			t.Fatalf("log output=%q, want %q", output, want)
		}
	}
}

func TestSkipVerifyPolicyNormalizesRuntimeAndApprovalValues(t *testing.T) {
	cases := []struct {
		name     string
		logEnv   string
		approval string
		wantErr  bool
	}{
		{name: "production requires approval", logEnv: " production ", approval: "", wantErr: true},
		{name: "prod accepts explicit yes", logEnv: "prod", approval: "yes"},
		{name: "local does not require approval", logEnv: "local", approval: ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("LOG_ENV", tc.logEnv)
			t.Setenv(TLSSkipVerifyApprovalEnv, tc.approval)

			err := ValidateSkipVerifyPolicy()
			if tc.wantErr && err == nil {
				t.Fatal("ValidateSkipVerifyPolicy err=nil, want error")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("ValidateSkipVerifyPolicy err=%v, want nil", err)
			}
		})
	}
}

func captureProfileTLSLogOutput(t *testing.T, fn func()) string {
	t.Helper()

	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	oldStderr := os.Stderr
	os.Stderr = writer
	logging.SetDefault(logging.New(logging.FormatText))
	defer func() {
		os.Stderr = oldStderr
		logging.SetDefault(logging.New(logging.FormatText))
	}()

	fn()
	_ = writer.Close()
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	_ = reader.Close()
	return string(body)
}

func generateTLSMaterials(t *testing.T) (string, string) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey err=%v", err)
	}

	template := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("CreateCertificate err=%v", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	return string(certPEM), string(keyPEM)
}

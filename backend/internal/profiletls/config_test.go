package profiletls

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"math/big"
	"testing"
	"time"

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

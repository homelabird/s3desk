package s3client

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
)

func TestFromProfileUsesStoredMTLSSettings(t *testing.T) {
	t.Parallel()

	certPEM, keyPEM := generateTLSMaterials(t)
	client, err := FromProfile(models.ProfileSecrets{
		Region: "us-west-2",
		TLSConfig: &models.ProfileTLSConfig{
			Mode:          models.ProfileTLSModeMTLS,
			ClientCertPEM: certPEM,
			ClientKeyPEM:  keyPEM,
			CACertPEM:     certPEM,
		},
	})
	if err != nil {
		t.Fatalf("FromProfile err=%v", err)
	}

	transport := transportForClient(t, client)
	tlsCfg := transport.TLSClientConfig
	if tlsCfg == nil {
		t.Fatal("transport.TLSClientConfig is nil")
	}
	if tlsCfg.MinVersion != tls.VersionTLS12 {
		t.Fatalf("tlsCfg.MinVersion=%v, want %v", tlsCfg.MinVersion, tls.VersionTLS12)
	}
	if len(tlsCfg.Certificates) != 1 {
		t.Fatalf("len(tlsCfg.Certificates)=%d, want 1", len(tlsCfg.Certificates))
	}
	if tlsCfg.RootCAs == nil || len(tlsCfg.RootCAs.Subjects()) == 0 {
		t.Fatalf("tlsCfg.RootCAs=%v, want populated root CAs", tlsCfg.RootCAs)
	}
}

func TestFromProfileRejectsInvalidMTLSConfig(t *testing.T) {
	t.Parallel()

	_, err := FromProfile(models.ProfileSecrets{
		TLSConfig: &models.ProfileTLSConfig{
			Mode:          models.ProfileTLSModeMTLS,
			ClientCertPEM: "invalid-cert",
			ClientKeyPEM:  "invalid-key",
		},
	})
	if err == nil {
		t.Fatal("FromProfile err=nil, want error")
	}
}

func TestPresignFromProfileRejectsInvalidMTLSConfig(t *testing.T) {
	t.Parallel()

	_, err := PresignFromProfile(models.ProfileSecrets{
		TLSConfig: &models.ProfileTLSConfig{
			Mode:          models.ProfileTLSModeMTLS,
			ClientCertPEM: "invalid-cert",
			ClientKeyPEM:  "invalid-key",
		},
	})
	if err == nil {
		t.Fatal("PresignFromProfile err=nil, want error")
	}
}

func transportForClient(t *testing.T, client *s3.Client) *http.Transport {
	t.Helper()

	httpClient, ok := client.Options().HTTPClient.(*http.Client)
	if !ok {
		t.Fatalf("client.Options().HTTPClient=%T, want *http.Client", client.Options().HTTPClient)
	}
	transport, ok := httpClient.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("httpClient.Transport=%T, want *http.Transport", httpClient.Transport)
	}
	return transport
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

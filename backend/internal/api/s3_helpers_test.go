package api

import (
	"crypto/tls"
	"net/http"
	"testing"

	"s3desk/internal/models"
)

func TestS3ClientFromProfileAppliesTLSConfig(t *testing.T) {
	certPEM, keyPEM := generateTestCert(t)
	client, err := s3ClientFromProfile(models.ProfileSecrets{
		Provider:              models.ProfileProviderAwsS3,
		Region:                "us-east-1",
		AccessKeyID:           "AKID",
		SecretAccessKey:       "SECRET",
		Endpoint:              "https://s3.example.com",
		TLSInsecureSkipVerify: false,
		TLSConfig: &models.ProfileTLSConfig{
			Mode:          models.ProfileTLSModeMTLS,
			ClientCertPEM: certPEM,
			ClientKeyPEM:  keyPEM,
			CACertPEM:     certPEM,
		},
	})
	if err != nil {
		t.Fatalf("s3ClientFromProfile: %v", err)
	}

	opts := client.Options()
	httpClient, ok := opts.HTTPClient.(*http.Client)
	if !ok {
		t.Fatalf("expected *http.Client, got %T", opts.HTTPClient)
	}
	transport, ok := httpClient.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("expected *http.Transport, got %T", httpClient.Transport)
	}
	if transport.TLSClientConfig == nil {
		t.Fatal("expected TLS client config")
	}
	if transport.TLSClientConfig.MinVersion != tls.VersionTLS12 {
		t.Fatalf("expected TLS 1.2 minimum, got %v", transport.TLSClientConfig.MinVersion)
	}
	if len(transport.TLSClientConfig.Certificates) != 1 {
		t.Fatalf("expected client certificate, got %d", len(transport.TLSClientConfig.Certificates))
	}
	if transport.TLSClientConfig.RootCAs == nil {
		t.Fatal("expected custom root CAs")
	}
}

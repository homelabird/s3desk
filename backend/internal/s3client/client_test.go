package s3client

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
)

func TestFromProfileAcceptsStoredMTLSSettingsAndUsesGuardedHTTPClient(t *testing.T) {
	t.Parallel()

	caPEM, clientCertPEM, clientKeyPEM, serverCert, clientCAPool := generateMTLSTestMaterials(t)
	client, err := FromProfile(models.ProfileSecrets{
		Region: "us-west-2",
		TLSConfig: &models.ProfileTLSConfig{
			Mode:          models.ProfileTLSModeMTLS,
			ClientCertPEM: clientCertPEM,
			ClientKeyPEM:  clientKeyPEM,
			CACertPEM:     caPEM,
		},
	})
	if err != nil {
		t.Fatalf("FromProfile err=%v", err)
	}

	httpClient := httpClientForS3Client(t, client)
	if httpClient.Transport == nil {
		t.Fatal("httpClient.Transport is nil")
	}

	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
			http.Error(w, "missing client certificate", http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	srv.TLS = &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{serverCert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    clientCAPool,
	}
	srv.StartTLS()
	t.Cleanup(srv.Close)

	resp, err := httpClient.Get(srv.URL)
	if err != nil {
		t.Fatalf("client.Get err=%v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("client.Get status=%d, want %d", resp.StatusCode, http.StatusNoContent)
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

func TestFromProfileRejectsBlockedEndpoint(t *testing.T) {
	t.Parallel()

	_, err := FromProfile(models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        "http://169.254.169.254/latest/meta-data",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	})
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("FromProfile err=%v, want blocked metadata host", err)
	}
}

func TestFromProfileRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := FromProfileWithOptions(models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        "http://127.0.0.1:9000",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}, ProfileOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("FromProfileWithOptions err=%v, want loopback rejection", err)
	}
}

func TestPresignFromProfileRejectsBlockedPublicEndpoint(t *testing.T) {
	t.Parallel()

	_, err := PresignFromProfile(models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        "http://127.0.0.1:9000",
		PublicEndpoint:  "http://169.254.169.254/latest/meta-data",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	})
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("PresignFromProfile err=%v, want blocked metadata host", err)
	}
}

func TestPresignFromProfileRejectsLoopbackPublicEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := PresignFromProfileWithOptions(models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		PublicEndpoint:  "http://127.0.0.1:9000",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}, ProfileOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("PresignFromProfileWithOptions err=%v, want loopback rejection", err)
	}
}

func TestFromProfileHTTPClientRejectsBlockedRedirect(t *testing.T) {
	t.Parallel()

	client, err := FromProfile(models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        "http://127.0.0.1:9000",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
		ForcePathStyle:  true,
	})
	if err != nil {
		t.Fatalf("FromProfile err=%v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	resp, err := httpClientForS3Client(t, client).Get(srv.URL)
	if resp != nil {
		_ = resp.Body.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("client.Get err=%v, want blocked metadata host", err)
	}
}

func httpClientForS3Client(t *testing.T, client *s3.Client) *http.Client {
	t.Helper()

	httpClient, ok := client.Options().HTTPClient.(*http.Client)
	if !ok {
		t.Fatalf("client.Options().HTTPClient=%T, want *http.Client", client.Options().HTTPClient)
	}
	return httpClient
}

func generateMTLSTestMaterials(t *testing.T) (string, string, string, tls.Certificate, *x509.CertPool) {
	t.Helper()

	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey ca err=%v", err)
	}
	caTemplate := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "s3desk test ca"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	caDER, err := x509.CreateCertificate(rand.Reader, &caTemplate, &caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("CreateCertificate ca err=%v", err)
	}
	caCert, err := x509.ParseCertificate(caDER)
	if err != nil {
		t.Fatalf("ParseCertificate ca err=%v", err)
	}
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})
	clientCAPool := x509.NewCertPool()
	clientCAPool.AddCert(caCert)

	clientCertPEM, clientKeyPEM := generateSignedCert(t, caCert, caKey, x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: "s3desk test client"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	})
	serverCertPEM, serverKeyPEM := generateSignedCert(t, caCert, caKey, x509.Certificate{
		SerialNumber: big.NewInt(3),
		Subject:      pkix.Name{CommonName: "127.0.0.1"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"localhost"},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
	})
	serverCert, err := tls.X509KeyPair([]byte(serverCertPEM), []byte(serverKeyPEM))
	if err != nil {
		t.Fatalf("X509KeyPair server err=%v", err)
	}

	return string(caPEM), clientCertPEM, clientKeyPEM, serverCert, clientCAPool
}

func generateSignedCert(t *testing.T, caCert *x509.Certificate, caKey *rsa.PrivateKey, template x509.Certificate) (string, string) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey cert err=%v", err)
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, caCert, &key.PublicKey, caKey)
	if err != nil {
		t.Fatalf("CreateCertificate cert err=%v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	return string(certPEM), string(keyPEM)
}

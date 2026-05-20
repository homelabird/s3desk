package gcsbucket

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/responsebody"
)

func TestGetBucketRejectsOversizedControlPlaneResponse(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat("x", int(responsebody.ControlPlaneMaxBytes)+1)))
	}))
	defer srv.Close()

	_, err := GetBucket(t.Context(), models.ProfileSecrets{
		GcpAnonymous: true,
		GcpEndpoint:  srv.URL,
	}, "demo")
	if err == nil {
		t.Fatal("expected oversized response error")
	}
	if !strings.Contains(err.Error(), "http response body exceeds") {
		t.Fatalf("error=%q, want response body limit", err.Error())
	}
}

func TestGetBucketWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := GetBucketWithOptions(t.Context(), models.ProfileSecrets{
		GcpAnonymous: true,
		GcpEndpoint:  "http://127.0.0.1:4443",
	}, "demo", ClientOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("GetBucketWithOptions err=%v, want loopback rejection", err)
	}
}

func TestResolveBearerTokenThreadsAllowRemoteToTokenClient(t *testing.T) {
	var gotAllowRemote bool
	prevClient := newTokenHTTPClient
	newTokenHTTPClient = func(opts ClientOptions) *http.Client {
		gotAllowRemote = opts.AllowRemote
		return &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(`{"access_token":"token"}`)),
				Request:    req,
			}, nil
		})}
	}
	defer func() {
		newTokenHTTPClient = prevClient
	}()

	token, err := resolveBearerToken(t.Context(), models.ProfileSecrets{
		GcpServiceAccountJSON: testServiceAccountJSON(t, "https://oauth2.googleapis.com/token"),
	}, ClientOptions{AllowRemote: true})
	if err != nil {
		t.Fatalf("resolveBearerToken: %v", err)
	}
	if token != "token" {
		t.Fatalf("token=%q, want token", token)
	}
	if !gotAllowRemote {
		t.Fatal("token client did not receive AllowRemote=true")
	}
}

func testServiceAccountJSON(t *testing.T, tokenURI string) string {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	payload, err := json.Marshal(map[string]string{
		"client_email": "svc@example.iam.gserviceaccount.com",
		"private_key":  string(keyPEM),
		"token_uri":    tokenURI,
	})
	if err != nil {
		t.Fatalf("Marshal service account: %v", err)
	}
	return string(payload)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

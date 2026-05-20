package gcsiam

import (
	"context"
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

func TestResolveBearerTokenAllowsAnonymousCustomEndpoint(t *testing.T) {
	t.Parallel()

	token, err := resolveBearerToken(context.Background(), models.ProfileSecrets{
		GcpAnonymous: true,
		GcpEndpoint:  "http://127.0.0.1:4443",
	}, ClientOptions{})
	if err != nil {
		t.Fatalf("resolveBearerToken: %v", err)
	}
	if token != "" {
		t.Fatalf("token=%q, want empty", token)
	}
}

func TestResolveBearerTokenRejectsAnonymousDefaultEndpoint(t *testing.T) {
	t.Parallel()

	_, err := resolveBearerToken(context.Background(), models.ProfileSecrets{
		GcpAnonymous: true,
	}, ClientOptions{})
	if err == nil {
		t.Fatal("expected anonymous IAM error")
	}
	if got := err.Error(); got != "anonymous GCS profile cannot manage IAM policy" {
		t.Fatalf("error=%q, want anonymous IAM error", got)
	}
}

func TestGetBucketIamPolicyUsesCustomEndpoint(t *testing.T) {
	t.Parallel()

	var gotPath string
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"bindings":[]}`))
	}))
	defer srv.Close()

	resp, err := GetBucketIamPolicy(context.Background(), models.ProfileSecrets{
		GcpAnonymous: true,
		GcpEndpoint:  srv.URL,
	}, "demo")
	if err != nil {
		t.Fatalf("GetBucketIamPolicy: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Fatalf("status=%d, want %d", resp.Status, http.StatusOK)
	}
	if gotPath != "/storage/v1/b/demo/iam" {
		t.Fatalf("path=%q, want %q", gotPath, "/storage/v1/b/demo/iam")
	}
	if gotAuth != "" {
		t.Fatalf("authorization=%q, want empty", gotAuth)
	}
}

func TestGetBucketIamPolicyWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := GetBucketIamPolicyWithOptions(context.Background(), models.ProfileSecrets{
		GcpAnonymous: true,
		GcpEndpoint:  "http://127.0.0.1:4443",
	}, "demo", ClientOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("GetBucketIamPolicyWithOptions err=%v, want loopback rejection", err)
	}
}

func TestGetBucketIamPolicyRejectsOversizedControlPlaneResponse(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat("x", int(responsebody.ControlPlaneMaxBytes)+1)))
	}))
	defer srv.Close()

	_, err := GetBucketIamPolicy(t.Context(), models.ProfileSecrets{
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

func TestResolveBearerTokenRejectsOversizedTokenResponse(t *testing.T) {
	prevClient := newTokenHTTPClient
	newTokenHTTPClient = func(ClientOptions) *http.Client {
		return &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(strings.Repeat("x", int(responsebody.TokenMaxBytes)+1))),
				Request:    req,
			}, nil
		})}
	}
	defer func() {
		newTokenHTTPClient = prevClient
	}()

	_, err := resolveBearerToken(t.Context(), models.ProfileSecrets{
		GcpServiceAccountJSON: testServiceAccountJSON(t, "https://oauth2.googleapis.com/token"),
	}, ClientOptions{})
	if err == nil {
		t.Fatal("expected oversized token response error")
	}
	if !strings.Contains(err.Error(), "read gcp access token response: http response body exceeds") {
		t.Fatalf("error=%q, want token response body limit", err.Error())
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

func TestResolveBearerTokenUsesTokenRequest(t *testing.T) {
	prevClient := newTokenHTTPClient
	newTokenHTTPClient = func(ClientOptions) *http.Client {
		return &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.String() != "https://oauth2.googleapis.com/token" {
				t.Fatalf("token URL=%q, want default token endpoint", req.URL.String())
			}
			if req.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
				t.Fatalf("content-type=%q, want form", req.Header.Get("Content-Type"))
			}
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
	}, ClientOptions{})
	if err != nil {
		t.Fatalf("resolveBearerToken: %v", err)
	}
	if token != "token" {
		t.Fatalf("token=%q, want token", token)
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

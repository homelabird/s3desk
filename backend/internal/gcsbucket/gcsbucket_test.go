package gcsbucket

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
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

func TestListObjectsPageMapsFieldsAndForwardsPageToken(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/storage/v1/b/my-bucket/o" {
			t.Errorf("path=%q", r.URL.Path)
		}
		if r.URL.Query().Get("prefix") != "docs/" || r.URL.Query().Get("delimiter") != "/" || r.URL.Query().Get("maxResults") != "2" {
			t.Errorf("query=%v", r.URL.Query())
		}
		if !strings.Contains(r.URL.Query().Get("fields"), "storageClass") {
			t.Errorf("fields=%q", r.URL.Query().Get("fields"))
		}
		if calls == 1 {
			if got := r.URL.Query().Get("pageToken"); got != "" {
				t.Errorf("first page token=%q", got)
			}
			_, _ = io.WriteString(w, `{"nextPageToken":"opaque/+==","items":[{"name":"docs/a.txt","size":"7","etag":"tag","updated":"2026-09-01T12:00:00Z","storageClass":"STANDARD"}],"prefixes":["docs/sub/"]}`)
			return
		}
		if got := r.URL.Query().Get("pageToken"); got != "opaque/+==" {
			t.Errorf("page token=%q", got)
		}
		_, _ = io.WriteString(w, `{"items":[{"name":"docs/b.txt","size":"0"}]}`)
	}))
	defer srv.Close()
	p := models.ProfileSecrets{GcpAnonymous: true, GcpEndpoint: srv.URL}
	req := objectlisting.Request{Bucket: "my-bucket", Prefix: "docs/", Delimiter: "/", MaxKeys: 2}
	first, err := ListObjectsPage(t.Context(), p, req, ClientOptions{})
	if err != nil || first.NextToken != "opaque/+==" || !first.IsTruncated || len(first.Items) != 1 || len(first.CommonPrefixes) != 1 {
		t.Fatalf("first=%+v err=%v", first, err)
	}
	req.ContinuationToken = first.NextToken
	second, err := ListObjectsPage(t.Context(), p, req, ClientOptions{})
	if err != nil || second.IsTruncated || len(second.Items) != 1 || second.Items[0].Size != 0 || calls != 2 {
		t.Fatalf("second=%+v calls=%d err=%v", second, calls, err)
	}
}

func TestListObjectsPageRejectsBadResponseAndHidesProviderBody(t *testing.T) {
	for _, body := range []string{`{"items":[{"name":"a","size":"bad"}]}`, `not-json`} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, body) }))
		_, err := ListObjectsPage(t.Context(), models.ProfileSecrets{GcpAnonymous: true, GcpEndpoint: srv.URL}, objectlisting.Request{Bucket: "b", MaxKeys: 10}, ClientOptions{})
		srv.Close()
		if err == nil || !strings.Contains(err.Error(), objectlisting.ErrInvalidPage.Error()) {
			t.Fatalf("body=%q err=%v", body, err)
		}
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "secret-provider-detail", http.StatusForbidden)
	}))
	defer srv.Close()
	_, err := ListObjectsPage(t.Context(), models.ProfileSecrets{GcpAnonymous: true, GcpEndpoint: srv.URL}, objectlisting.Request{Bucket: "b", MaxKeys: 10}, ClientOptions{})
	var statusErr *HTTPStatusError
	if !errors.As(err, &statusErr) || statusErr.StatusCode != http.StatusForbidden || strings.Contains(err.Error(), "secret-provider-detail") {
		t.Fatalf("err=%v", err)
	}
}

func TestListObjectsPageUsesServiceAccountBearerToken(t *testing.T) {
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer list-token" {
			t.Errorf("authorization=%q", got)
		}
		_, _ = io.WriteString(w, `{"items":[]}`)
	}))
	defer storage.Close()
	previous := newTokenHTTPClient
	newTokenHTTPClient = func(ClientOptions) *http.Client {
		return &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"access_token":"list-token"}`)), Request: req}, nil
		})}
	}
	defer func() { newTokenHTTPClient = previous }()
	profile := models.ProfileSecrets{GcpEndpoint: storage.URL, GcpServiceAccountJSON: testServiceAccountJSON(t, "https://oauth2.googleapis.com/token")}
	if _, err := ListObjectsPage(t.Context(), profile, objectlisting.Request{Bucket: "b", MaxKeys: 10}, ClientOptions{}); err != nil {
		t.Fatal(err)
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

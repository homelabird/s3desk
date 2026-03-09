package gcsiam

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/models"
)

func TestResolveBearerTokenAllowsAnonymousCustomEndpoint(t *testing.T) {
	t.Parallel()

	token, err := resolveBearerToken(context.Background(), models.ProfileSecrets{
		GcpAnonymous: true,
		GcpEndpoint:  "http://127.0.0.1:4443",
	})
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
	})
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

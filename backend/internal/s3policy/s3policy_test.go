package s3policy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/models"
)

func TestResolveEndpointDefaultsToAWSRegion(t *testing.T) {
	t.Parallel()

	u, region, err := resolveEndpoint(models.ProfileSecrets{
		Region: "ap-northeast-2",
	})
	if err != nil {
		t.Fatalf("resolveEndpoint: %v", err)
	}
	if region != "ap-northeast-2" {
		t.Fatalf("region=%q, want ap-northeast-2", region)
	}
	if got := u.String(); got != "https://s3.ap-northeast-2.amazonaws.com" {
		t.Fatalf("endpoint=%q, want %q", got, "https://s3.ap-northeast-2.amazonaws.com")
	}
}

func TestGetBucketPolicyUsesSignedPathStyleRequest(t *testing.T) {
	t.Parallel()

	var gotPath string
	var gotHasPolicy bool
	var gotAuth string
	var gotSessionToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotHasPolicy = r.URL.Query().Has("policy")
		gotAuth = r.Header.Get("Authorization")
		gotSessionToken = r.Header.Get("X-Amz-Security-Token")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"Statement":[]}`))
	}))
	defer srv.Close()

	sessionToken := "session-token"
	resp, err := GetBucketPolicy(context.Background(), models.ProfileSecrets{
		Endpoint:        srv.URL,
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
		SessionToken:    &sessionToken,
		ForcePathStyle:  true,
	}, "demo")
	if err != nil {
		t.Fatalf("GetBucketPolicy: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Fatalf("status=%d, want %d", resp.Status, http.StatusOK)
	}
	if gotPath != "/demo" {
		t.Fatalf("path=%q, want %q", gotPath, "/demo")
	}
	if !gotHasPolicy {
		t.Fatal("expected ?policy query parameter")
	}
	if gotAuth == "" {
		t.Fatal("expected authorization header")
	}
	if gotSessionToken != sessionToken {
		t.Fatalf("session token=%q, want %q", gotSessionToken, sessionToken)
	}
}

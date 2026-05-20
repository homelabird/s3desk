package s3policy

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/responsebody"
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

func TestGetBucketPolicyRejectsOversizedResponseBody(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(strings.Repeat("x", int(responsebody.ControlPlaneMaxBytes)+1)))
	}))
	defer srv.Close()

	_, err := GetBucketPolicy(context.Background(), models.ProfileSecrets{
		Endpoint:        srv.URL,
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
		ForcePathStyle:  true,
	}, "demo")

	var limitErr responsebody.TooLargeError
	if !errors.As(err, &limitErr) {
		t.Fatalf("GetBucketPolicy err=%v, want TooLargeError", err)
	}
	if limitErr.MaxBytes != responsebody.ControlPlaneMaxBytes {
		t.Fatalf("MaxBytes=%d, want %d", limitErr.MaxBytes, responsebody.ControlPlaneMaxBytes)
	}
}

func TestGetBucketPolicyWithOptionsRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, err := GetBucketPolicyWithOptions(context.Background(), models.ProfileSecrets{
		Endpoint:        "http://127.0.0.1:9000",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
		ForcePathStyle:  true,
	}, "demo", ClientOptions{AllowRemote: true})
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("GetBucketPolicyWithOptions err=%v, want loopback rejection", err)
	}
}

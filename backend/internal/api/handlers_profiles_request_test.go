package api

import (
	"context"
	"net"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestPrepareCreateProfileRequest_NormalizesDefaultsAndNilEmptyOptionals(t *testing.T) {
	t.Parallel()

	name := "  demo  "
	endpoint := "  http://127.0.0.1:9000  "
	region := "  us-east-1  "
	accessKeyID := "  access  "
	secretAccessKey := "  secret  "
	publicEndpoint := "   "

	req, err := prepareCreateProfileRequest(models.ProfileCreateRequest{
		Name:            name,
		Endpoint:        &endpoint,
		PublicEndpoint:  &publicEndpoint,
		Region:          &region,
		AccessKeyID:     &accessKeyID,
		SecretAccessKey: &secretAccessKey,
	}, false)
	if err != nil {
		t.Fatalf("prepareCreateProfileRequest() error=%v", err)
	}

	if req.Provider != models.ProfileProviderS3Compatible {
		t.Fatalf("req.Provider=%q, want %q", req.Provider, models.ProfileProviderS3Compatible)
	}
	if req.Name != "demo" {
		t.Fatalf("req.Name=%q, want %q", req.Name, "demo")
	}
	if req.Endpoint == nil || *req.Endpoint != "http://127.0.0.1:9000" {
		t.Fatalf("req.Endpoint=%v, want trimmed endpoint", req.Endpoint)
	}
	if req.PublicEndpoint != nil {
		t.Fatalf("req.PublicEndpoint=%v, want nil", req.PublicEndpoint)
	}
	if req.Region == nil || *req.Region != "us-east-1" {
		t.Fatalf("req.Region=%v, want trimmed region", req.Region)
	}
	if req.ForcePathStyle == nil || *req.ForcePathStyle {
		t.Fatalf("req.ForcePathStyle=%v, want pointer to false", req.ForcePathStyle)
	}
}

func TestPrepareCreateProfileRequest_RejectsTLSSkipVerifyWithoutCustomEndpoint(t *testing.T) {
	t.Parallel()

	region := "us-east-1"
	accessKeyID := "access"
	secretAccessKey := "secret"
	_, err := prepareCreateProfileRequest(models.ProfileCreateRequest{
		Provider:              models.ProfileProviderAwsS3,
		Name:                  "aws-default",
		Region:                &region,
		AccessKeyID:           &accessKeyID,
		SecretAccessKey:       &secretAccessKey,
		TLSInsecureSkipVerify: true,
	}, false)
	if err == nil || !strings.Contains(err.Error(), "custom https:// endpoint") {
		t.Fatalf("prepareCreateProfileRequest() error=%v, want custom endpoint rejection", err)
	}
}

func TestPrepareUpdateProfileRequest_TrimPreservesExplicitEmptySessionToken(t *testing.T) {
	t.Parallel()

	provider := models.ProfileProvider(" s3_compatible ")
	sessionToken := "   "

	req, err := prepareUpdateProfileRequest(models.ProfileUpdateRequest{
		Provider:     provider,
		SessionToken: &sessionToken,
	})
	if err != nil {
		t.Fatalf("prepareUpdateProfileRequest() error=%v", err)
	}

	if req.Provider != models.ProfileProviderS3Compatible {
		t.Fatalf("req.Provider=%q, want %q", req.Provider, models.ProfileProviderS3Compatible)
	}
	if req.SessionToken == nil {
		t.Fatal("req.SessionToken=nil, want explicit empty string")
	}
	if *req.SessionToken != "" {
		t.Fatalf("*req.SessionToken=%q, want empty string", *req.SessionToken)
	}
}

func TestValidatePreparedUpdateProfileRequest_RejectsPublicEndpointWhileTLSSkipVerifyEnabled(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			switch host {
			case "public.example.com":
				return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
			default:
				t.Fatalf("LookupIPAddr host=%q", host)
				return nil, nil
			}
		},
	)

	endpoint := "https://public.example.com"
	err := validatePreparedUpdateProfileRequest(models.Profile{
		Endpoint:              "https://minio.internal:9000",
		TLSInsecureSkipVerify: true,
	}, models.ProfileUpdateRequest{
		Endpoint: &endpoint,
	}, false)
	if err == nil || !strings.Contains(err.Error(), "allowed only for private") {
		t.Fatalf("validatePreparedUpdateProfileRequest() error=%v, want private-endpoint rejection", err)
	}
}

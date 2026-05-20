package azurearmimmutability

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/responsebody"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestGetTokenRejectsOversizedOAuthResponse(t *testing.T) {
	t.Parallel()

	client := &Client{httpClient: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(strings.Repeat("x", int(responsebody.TokenMaxBytes)+1))),
			Request:    req,
		}, nil
	})}}

	_, err := client.getToken(context.Background(), testARMProfile())

	var limitErr responsebody.TooLargeError
	if !errors.As(err, &limitErr) {
		t.Fatalf("getToken err=%v, want TooLargeError", err)
	}
	if limitErr.MaxBytes != responsebody.TokenMaxBytes {
		t.Fatalf("MaxBytes=%d, want %d", limitErr.MaxBytes, responsebody.TokenMaxBytes)
	}
}

func TestDoRejectsOversizedControlPlaneResponse(t *testing.T) {
	t.Parallel()

	client := &Client{httpClient: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(strings.Repeat("x", int(responsebody.ControlPlaneMaxBytes)+1))),
			Request:    req,
		}, nil
	})}}

	_, err := client.do(context.Background(), http.MethodGet, "https://management.azure.com/resource", "token", "", nil)

	var limitErr responsebody.TooLargeError
	if !errors.As(err, &limitErr) {
		t.Fatalf("do err=%v, want TooLargeError", err)
	}
	if limitErr.MaxBytes != responsebody.ControlPlaneMaxBytes {
		t.Fatalf("MaxBytes=%d, want %d", limitErr.MaxBytes, responsebody.ControlPlaneMaxBytes)
	}
}

func TestGetPolicyWithOptionsThreadsAllowRemoteToHTTPClient(t *testing.T) {
	var gotAllowRemote bool
	prevClient := newHTTPClient
	newHTTPClient = func(opts ClientOptions) *http.Client {
		gotAllowRemote = opts.AllowRemote
		return &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.Host {
			case "login.microsoftonline.com":
				if req.Method != http.MethodPost {
					t.Fatalf("token method=%s, want POST", req.Method)
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader(`{"access_token":"token"}`)),
					Request:    req,
				}, nil
			case "management.azure.com":
				if req.Method != http.MethodGet {
					t.Fatalf("arm method=%s, want GET", req.Method)
				}
				if got := req.Header.Get("Authorization"); got != "Bearer token" {
					t.Fatalf("authorization=%q, want bearer token", got)
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader(`{"properties":{"state":"Unlocked"}}`)),
					Request:    req,
				}, nil
			default:
				t.Fatalf("unexpected host %q", req.URL.Host)
				return nil, nil
			}
		})}
	}
	defer func() {
		newHTTPClient = prevClient
	}()

	resp, err := GetPolicyWithOptions(t.Context(), testARMProfile(), "demo", ClientOptions{AllowRemote: true})
	if err != nil {
		t.Fatalf("GetPolicyWithOptions: %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Fatalf("status=%d, want 200", resp.Status)
	}
	if !gotAllowRemote {
		t.Fatal("HTTP client did not receive AllowRemote=true")
	}
}

func testARMProfile() models.ProfileSecrets {
	return models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureAccountName:    "account",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
}

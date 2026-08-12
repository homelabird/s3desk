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

func TestLegalHoldMethodsUseContainerResource(t *testing.T) {
	var paths []string
	var bodies []string
	prevClient := newHTTPClient
	newHTTPClient = func(ClientOptions) *http.Client {
		return &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.Host {
			case "login.microsoftonline.com":
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader(`{"access_token":"token"}`)),
					Request:    req,
				}, nil
			case "management.azure.com":
				paths = append(paths, req.URL.Path)
				var body []byte
				if req.Body != nil {
					var err error
					body, err = io.ReadAll(req.Body)
					if err != nil {
						return nil, err
					}
				}
				bodies = append(bodies, string(body))
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader(`{"hasLegalHold":true,"tags":["tag1"]}`)),
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

	if _, err := SetLegalHoldWithOptions(t.Context(), testARMProfile(), "demo", LegalHoldRequest{Tags: []string{"tag1"}}, ClientOptions{}); err != nil {
		t.Fatalf("SetLegalHoldWithOptions: %v", err)
	}
	if _, err := ClearLegalHoldWithOptions(t.Context(), testARMProfile(), "demo", LegalHoldRequest{Tags: []string{"tag1"}}, ClientOptions{}); err != nil {
		t.Fatalf("ClearLegalHoldWithOptions: %v", err)
	}
	if _, err := GetContainerWithOptions(t.Context(), testARMProfile(), "demo", ClientOptions{}); err != nil {
		t.Fatalf("GetContainerWithOptions: %v", err)
	}

	if len(paths) != 3 {
		t.Fatalf("management calls=%d, want 3", len(paths))
	}
	if !strings.HasSuffix(paths[0], "/containers/demo/setLegalHold") {
		t.Fatalf("set path=%q, want container setLegalHold path", paths[0])
	}
	if !strings.HasSuffix(paths[1], "/containers/demo/clearLegalHold") {
		t.Fatalf("clear path=%q, want container clearLegalHold path", paths[1])
	}
	if !strings.HasSuffix(paths[2], "/containers/demo") {
		t.Fatalf("get path=%q, want container path", paths[2])
	}
	if bodies[0] != `{"tags":["tag1"]}` || bodies[1] != `{"tags":["tag1"]}` || bodies[2] != "" {
		t.Fatalf("request bodies=%q, want set/clear tags and empty get body", bodies)
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

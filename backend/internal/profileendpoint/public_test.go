package profileendpoint

import (
	"net/url"
	"testing"
)

func TestLoopbackPublicEndpointRequiresExplicitExactOptIn(t *testing.T) {
	const configured = "http://127.0.0.1:8333"
	for _, tc := range []struct {
		name, allow, target string
		wantOK              bool
	}{
		{"default remains blocked", "", configured, false},
		{"exact explicit demo URL", configured, configured, true},
		{"trailing slash", configured, configured + "/", true},
		{"different loopback port", configured, "http://127.0.0.1:8080", false},
		{"different loopback IP", configured, "http://127.0.0.2:8333", false},
		{"different scheme", configured, "https://127.0.0.1:8333", false},
		{"metadata is never an exception", "http://169.254.169.254", "http://169.254.169.254", false},
		{"link local is never an exception", "http://169.254.12.34", "http://169.254.12.34", false},
		{"unspecified is never an exception", "http://0.0.0.0:8333", "http://0.0.0.0:8333", false},
		{"query remains blocked", configured + "?x=1", configured + "?x=1", false},
		{"credentials remain blocked", "http://user:pass@127.0.0.1:8333", "http://user:pass@127.0.0.1:8333", false},
		{"fragment remains blocked", configured + "#x", configured + "#x", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT", tc.allow)
			err := ValidatePublicURL("publicEndpoint", &tc.target, true)
			if (err == nil) != tc.wantOK {
				t.Fatalf("success=%v, want %v", err == nil, tc.wantOK)
			}
		})
	}
}

func TestPublicEndpointExceptionNeverAllowsServerRequests(t *testing.T) {
	endpoint := "http://127.0.0.1:8333"
	t.Setenv("S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT", endpoint)
	if err := ValidatePublicURL("publicEndpoint", &endpoint, true); err != nil {
		t.Fatal(err)
	}
	if err := ValidateURL("endpoint", &endpoint, true); err == nil {
		t.Fatal("internal endpoint unexpectedly accepted a loopback target")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateRequestURL("request", parsed, true); err == nil {
		t.Fatal("outbound request unexpectedly accepted a loopback target")
	}
}

func TestPublicURLKeepsOrdinaryRemoteAndLocalValidation(t *testing.T) {
	t.Setenv("S3DESK_ALLOWED_LOOPBACK_PUBLIC_ENDPOINT", "")
	lan := "http://192.168.50.20:8333"
	if err := ValidatePublicURL("publicEndpoint", &lan, true); err != nil {
		t.Fatal(err)
	}
	local := "http://127.0.0.1:8333"
	if err := ValidatePublicURL("publicEndpoint", &local, false); err != nil {
		t.Fatal(err)
	}
	if err := ValidatePublicURL("publicEndpoint", nil, true); err != nil {
		t.Fatal(err)
	}
}

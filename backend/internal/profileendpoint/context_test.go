package profileendpoint

import (
	"context"
	"errors"
	"net"
	"testing"

	"s3desk/internal/models"
)

func TestContextEndpointValidatorsHonorCancellation(t *testing.T) {
	endpoint := "https://storage.example"
	for _, operation := range []struct {
		name string
		run  func(context.Context) error
	}{
		{"URL", func(ctx context.Context) error { return ValidateURLContext(ctx, "endpoint", &endpoint, false) }},
		{"public URL", func(ctx context.Context) error { return ValidatePublicURLContext(ctx, "endpoint", &endpoint, false) }},
		{"TLS policy", func(ctx context.Context) error {
			return ValidateTLSSkipVerifyEndpointContext(ctx, "endpoint", &endpoint, false)
		}},
		{"profile", func(ctx context.Context) error {
			return ValidateProfileSecretsEndpointsContext(ctx, models.ProfileSecrets{Endpoint: endpoint}, false)
		}},
		{"host", func(ctx context.Context) error {
			_, err := ResolveHostContext(ctx, "host", "storage.example", false)
			return err
		}},
	} {
		for _, stage := range []string{"already canceled", "cname", "ip"} {
			t.Run(operation.name+"/"+stage, func(t *testing.T) {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				if stage == "already canceled" {
					cancel()
				}
				restore := SetLookupHooksForTest(
					func(lookupCtx context.Context, _ string) (string, error) {
						if stage == "already canceled" {
							t.Error("canceled validation started DNS")
						}
						if stage == "cname" {
							cancel()
							return "", lookupCtx.Err()
						}
						return "", errors.New("no cname")
					},
					func(lookupCtx context.Context, _ string) ([]net.IPAddr, error) {
						if stage != "ip" {
							t.Error("validation continued DNS after cancellation")
						}
						cancel()
						return nil, lookupCtx.Err()
					},
				)
				defer restore()
				if err := operation.run(ctx); !errors.Is(err, context.Canceled) {
					t.Fatalf("error=%v, want context.Canceled", err)
				}
			})
		}
	}
}

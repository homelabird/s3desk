package jobs

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
)

func TestJobEndpointValidationHonorsCancellation(t *testing.T) {
	tests := []struct {
		name string
		run  func(context.Context, *Manager, models.ProfileSecrets) error
	}{
		{"rclone config", func(ctx context.Context, manager *Manager, profile models.ProfileSecrets) error {
			_, err := manager.writeRcloneConfig(ctx, "job-dns-cancel", profile)
			return err
		}},
		{"rclone command", func(ctx context.Context, manager *Manager, profile models.ProfileSecrets) error {
			_, err := manager.startRcloneCommand(ctx, profile, "job-dns-cancel", nil)
			return err
		}},
		{"s3 client", func(ctx context.Context, _ *Manager, profile models.ProfileSecrets) error {
			_, err := s3ClientFromProfile(ctx, profile, false, nil)
			return err
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			started := make(chan struct{}, 1)
			ipLookupCalled := false
			t.Cleanup(profileendpoint.SetLookupHooksForTest(func(ctx context.Context, _ string) (string, error) {
				started <- struct{}{}
				<-ctx.Done()
				return "", ctx.Err()
			}, func(context.Context, string) ([]net.IPAddr, error) {
				ipLookupCalled = true
				return nil, context.Canceled
			}))
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			manager := NewManager(Config{DataDir: t.TempDir()})
			profile := models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible, Endpoint: "http://cancel.example:9000"}
			done := make(chan error, 1)
			go func() { done <- test.run(ctx, manager, profile) }()
			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("endpoint validation did not start DNS lookup")
			}
			cancel()
			select {
			case err := <-done:
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("endpoint validation returned %v, want context.Canceled", err)
				}
				if ipLookupCalled {
					t.Fatal("IP lookup started after cancellation")
				}
			case <-time.After(time.Second):
				t.Fatal("endpoint validation did not stop after cancellation")
			}
		})
	}
}

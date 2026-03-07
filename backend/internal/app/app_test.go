package app

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"

	"gorm.io/gorm"
)

func TestApplySafeDefaults(t *testing.T) {
	cfg := config.Config{
		DBStartupTimeout:            0,
		DBStartupRetryInterval:      0,
		JobConcurrency:              0,
		JobLogMaxBytes:              -1,
		JobRetention:                -time.Second,
		JobLogRetention:             -time.Second,
		UploadSessionTTL:            0,
		UploadMaxBytes:              -1,
		UploadMaxConcurrentRequests: -1,
	}

	applySafeDefaults(&cfg)

	if cfg.DBStartupTimeout != defaultDBStartupTimeout {
		t.Fatalf("DBStartupTimeout=%s, want %s", cfg.DBStartupTimeout, defaultDBStartupTimeout)
	}
	if cfg.DBStartupRetryInterval != defaultDBStartupRetryInterval {
		t.Fatalf("DBStartupRetryInterval=%s, want %s", cfg.DBStartupRetryInterval, defaultDBStartupRetryInterval)
	}
	if cfg.JobConcurrency != 1 {
		t.Fatalf("JobConcurrency=%d, want 1", cfg.JobConcurrency)
	}
	if cfg.JobLogMaxBytes != 0 {
		t.Fatalf("JobLogMaxBytes=%d, want 0", cfg.JobLogMaxBytes)
	}
	if cfg.JobRetention != 0 {
		t.Fatalf("JobRetention=%s, want 0", cfg.JobRetention)
	}
	if cfg.JobLogRetention != 0 {
		t.Fatalf("JobLogRetention=%s, want 0", cfg.JobLogRetention)
	}
	if cfg.UploadSessionTTL != defaultUploadSessionTTL {
		t.Fatalf("UploadSessionTTL=%s, want %s", cfg.UploadSessionTTL, defaultUploadSessionTTL)
	}
	if cfg.UploadMaxBytes != 0 {
		t.Fatalf("UploadMaxBytes=%d, want 0", cfg.UploadMaxBytes)
	}
	if cfg.UploadMaxConcurrentRequests != defaultUploadMaxConcurrentRequests {
		t.Fatalf("UploadMaxConcurrentRequests=%d, want %d", cfg.UploadMaxConcurrentRequests, defaultUploadMaxConcurrentRequests)
	}
}

func TestApplySafeDefaultsPreservesConfiguredValues(t *testing.T) {
	cfg := config.Config{
		DBStartupTimeout:            45 * time.Second,
		DBStartupRetryInterval:      1500 * time.Millisecond,
		JobConcurrency:              4,
		JobLogMaxBytes:              123,
		JobRetention:                2 * time.Hour,
		JobLogRetention:             3 * time.Hour,
		UploadSessionTTL:            90 * time.Minute,
		UploadMaxBytes:              1024,
		UploadMaxConcurrentRequests: 0,
	}

	applySafeDefaults(&cfg)

	if cfg.DBStartupTimeout != 45*time.Second {
		t.Fatalf("DBStartupTimeout=%s, want %s", cfg.DBStartupTimeout, 45*time.Second)
	}
	if cfg.DBStartupRetryInterval != 1500*time.Millisecond {
		t.Fatalf("DBStartupRetryInterval=%s, want %s", cfg.DBStartupRetryInterval, 1500*time.Millisecond)
	}
	if cfg.JobConcurrency != 4 {
		t.Fatalf("JobConcurrency=%d, want 4", cfg.JobConcurrency)
	}
	if cfg.JobLogMaxBytes != 123 {
		t.Fatalf("JobLogMaxBytes=%d, want 123", cfg.JobLogMaxBytes)
	}
	if cfg.JobRetention != 2*time.Hour {
		t.Fatalf("JobRetention=%s, want %s", cfg.JobRetention, 2*time.Hour)
	}
	if cfg.JobLogRetention != 3*time.Hour {
		t.Fatalf("JobLogRetention=%s, want %s", cfg.JobLogRetention, 3*time.Hour)
	}
	if cfg.UploadSessionTTL != 90*time.Minute {
		t.Fatalf("UploadSessionTTL=%s, want %s", cfg.UploadSessionTTL, 90*time.Minute)
	}
	if cfg.UploadMaxBytes != 1024 {
		t.Fatalf("UploadMaxBytes=%d, want 1024", cfg.UploadMaxBytes)
	}
	if cfg.UploadMaxConcurrentRequests != 0 {
		t.Fatalf("UploadMaxConcurrentRequests=%d, want 0", cfg.UploadMaxConcurrentRequests)
	}
}

func TestOpenWithRetryRetriesTransientPostgresStartupError(t *testing.T) {
	attempts := 0
	sleeps := 0

	got, err := openWithRetry(
		context.Background(),
		time.Second,
		time.Millisecond,
		func() (*gorm.DB, error) {
			attempts++
			if attempts < 3 {
				return nil, errors.New("dial error: connect: connection refused")
			}
			return &gorm.DB{}, nil
		},
		isRetriablePostgresStartupError,
		func(context.Context, time.Duration) error {
			sleeps++
			return nil
		},
	)
	if err != nil {
		t.Fatalf("openWithRetry returned error: %v", err)
	}
	if got == nil {
		t.Fatal("openWithRetry returned nil db")
	}
	if attempts != 3 {
		t.Fatalf("attempts=%d, want 3", attempts)
	}
	if sleeps != 2 {
		t.Fatalf("sleeps=%d, want 2", sleeps)
	}
}

func TestOpenWithRetryStopsOnNonRetriableError(t *testing.T) {
	wantErr := errors.New("password authentication failed for user \"s3desk\"")
	attempts := 0

	got, err := openWithRetry(
		context.Background(),
		time.Second,
		time.Millisecond,
		func() (*gorm.DB, error) {
			attempts++
			return nil, wantErr
		},
		isRetriablePostgresStartupError,
		func(context.Context, time.Duration) error {
			t.Fatal("sleep should not be called for non-retriable errors")
			return nil
		},
	)
	if got != nil {
		t.Fatal("expected nil db on non-retriable failure")
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("error=%v, want %v", err, wantErr)
	}
	if attempts != 1 {
		t.Fatalf("attempts=%d, want 1", attempts)
	}
}

func TestOpenWithRetryReturnsTimeoutError(t *testing.T) {
	_, err := openWithRetry(
		context.Background(),
		10*time.Millisecond,
		time.Hour,
		func() (*gorm.DB, error) {
			return nil, errors.New("dial error: connect: connection refused")
		},
		isRetriablePostgresStartupError,
		func(ctx context.Context, _ time.Duration) error {
			<-ctx.Done()
			return ctx.Err()
		},
	)
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !strings.Contains(err.Error(), "postgres did not become ready within") {
		t.Fatalf("error=%q, want timeout message", err)
	}
}

func TestIsRetriablePostgresStartupError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "connection refused", err: errors.New("failed to connect: dial error: connect: connection refused"), want: true},
		{name: "dns failure", err: errors.New("failed to connect: lookup postgres: no such host"), want: true},
		{name: "bad password", err: errors.New("password authentication failed for user \"s3desk\""), want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := isRetriablePostgresStartupError(tc.err); got != tc.want {
				t.Fatalf("isRetriablePostgresStartupError()=%v, want %v", got, tc.want)
			}
		})
	}
}

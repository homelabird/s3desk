package app

import (
	"testing"
	"time"

	"s3desk/internal/config"
)

func TestApplySafeDefaults(t *testing.T) {
	cfg := config.Config{
		JobConcurrency:              0,
		JobLogMaxBytes:              -1,
		JobRetention:                -time.Second,
		JobLogRetention:             -time.Second,
		UploadSessionTTL:            0,
		UploadMaxBytes:              -1,
		UploadMaxConcurrentRequests: -1,
	}

	applySafeDefaults(&cfg)

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
		JobConcurrency:              4,
		JobLogMaxBytes:              123,
		JobRetention:                2 * time.Hour,
		JobLogRetention:             3 * time.Hour,
		UploadSessionTTL:            90 * time.Minute,
		UploadMaxBytes:              1024,
		UploadMaxConcurrentRequests: 0,
	}

	applySafeDefaults(&cfg)

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

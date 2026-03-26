package main

import (
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"
)

func TestApplyEnvConfigOverridesAppliesValidValues(t *testing.T) {
	t.Setenv("JOB_CONCURRENCY", "7")
	t.Setenv("UPLOAD_TTL", "90m")
	t.Setenv("ALLOW_REMOTE", "true")

	cfg := config.Config{
		JobConcurrency:   2,
		UploadSessionTTL: 24 * time.Hour,
		AllowRemote:      false,
	}

	if err := applyEnvConfigOverrides(&cfg, nil); err != nil {
		t.Fatalf("applyEnvConfigOverrides() error = %v", err)
	}
	if cfg.JobConcurrency != 7 {
		t.Fatalf("JobConcurrency = %d, want 7", cfg.JobConcurrency)
	}
	if cfg.UploadSessionTTL != 90*time.Minute {
		t.Fatalf("UploadSessionTTL = %s, want %s", cfg.UploadSessionTTL, 90*time.Minute)
	}
	if !cfg.AllowRemote {
		t.Fatalf("AllowRemote = false, want true")
	}
}

func TestApplyEnvConfigOverridesRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name string
		key  string
		val  string
		want string
		cfg  config.Config
	}{
		{
			name: "invalid int",
			key:  "JOB_CONCURRENCY",
			val:  "many",
			want: "JOB_CONCURRENCY",
			cfg:  config.Config{JobConcurrency: 2},
		},
		{
			name: "invalid int64",
			key:  "JOB_LOG_MAX_BYTES",
			val:  "huge",
			want: "JOB_LOG_MAX_BYTES",
			cfg:  config.Config{JobLogMaxBytes: 0},
		},
		{
			name: "invalid duration",
			key:  "UPLOAD_TTL",
			val:  "tomorrow",
			want: "UPLOAD_TTL",
			cfg:  config.Config{UploadSessionTTL: time.Hour},
		},
		{
			name: "invalid bool",
			key:  "ALLOW_REMOTE",
			val:  "sometimes",
			want: "ALLOW_REMOTE",
			cfg:  config.Config{AllowRemote: false},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(tc.key, tc.val)

			err := applyEnvConfigOverrides(&tc.cfg, nil)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("applyEnvConfigOverrides() error = %v, want message containing %q", err, tc.want)
			}
		})
	}
}

func TestApplyEnvConfigOverridesIgnoresEnvWhenFlagWasSet(t *testing.T) {
	t.Setenv("JOB_CONCURRENCY", "broken")

	cfg := config.Config{
		JobConcurrency: 5,
	}
	setFlags := map[string]struct{}{
		"job-concurrency": {},
	}

	if err := applyEnvConfigOverrides(&cfg, setFlags); err != nil {
		t.Fatalf("applyEnvConfigOverrides() error = %v", err)
	}
	if cfg.JobConcurrency != 5 {
		t.Fatalf("JobConcurrency = %d, want 5", cfg.JobConcurrency)
	}
}

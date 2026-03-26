package jobs

import (
	"strings"
	"testing"
	"time"
)

func TestValidateEnvironmentRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
	}{
		{name: "queue capacity", key: "JOB_QUEUE_CAPACITY", value: "abc"},
		{name: "stats interval", key: "RCLONE_STATS_INTERVAL", value: "fast"},
		{name: "tune flag", key: "RCLONE_TUNE", value: "maybe"},
		{name: "retry jitter", key: "RCLONE_RETRY_JITTER_RATIO", value: "lots"},
		{name: "max transfers", key: "RCLONE_MAX_TRANSFERS", value: "many"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(tc.key, tc.value)

			err := ValidateEnvironment(Config{Concurrency: 1})
			if err == nil {
				t.Fatalf("ValidateEnvironment() error=nil, want invalid %s error", tc.key)
			}
			if !strings.Contains(err.Error(), tc.key) {
				t.Fatalf("ValidateEnvironment() error=%q, want key %q", err.Error(), tc.key)
			}
		})
	}
}

func TestResolveManagerWiringClampsParsedValues(t *testing.T) {
	t.Setenv("JOB_QUEUE_CAPACITY", "0")
	t.Setenv("JOB_LOG_MAX_LINE_BYTES", "-5")
	t.Setenv("RCLONE_STATS_INTERVAL", "100ms")
	t.Setenv("RCLONE_RETRY_ATTEMPTS", "0")
	t.Setenv("RCLONE_RETRY_BASE_DELAY", "-1s")
	t.Setenv("RCLONE_RETRY_MAX_DELAY", "-2s")
	t.Setenv("RCLONE_RETRY_JITTER_RATIO", "2")
	t.Setenv("RCLONE_TUNE", "off")
	t.Setenv("RCLONE_CAPTURE_UNKNOWN_ERRORS", "on")

	wiring, err := resolveManagerWiring(Config{
		Concurrency:      0,
		AllowedLocalDirs: []string{".", "/tmp/../tmp/data"},
	})
	if err != nil {
		t.Fatalf("resolveManagerWiring() error = %v", err)
	}

	if wiring.concurrency != 1 {
		t.Fatalf("concurrency=%d, want 1", wiring.concurrency)
	}
	if wiring.queueCapacity != defaultJobQueueCapacity {
		t.Fatalf("queueCapacity=%d, want %d", wiring.queueCapacity, defaultJobQueueCapacity)
	}
	if wiring.logLineMaxBytes != defaultMaxLogLineBytes {
		t.Fatalf("logLineMaxBytes=%d, want %d", wiring.logLineMaxBytes, defaultMaxLogLineBytes)
	}
	if wiring.rcloneStatsInterval != 500*time.Millisecond {
		t.Fatalf("rcloneStatsInterval=%s, want %s", wiring.rcloneStatsInterval, 500*time.Millisecond)
	}
	if wiring.rcloneRetryAttempts != 1 {
		t.Fatalf("rcloneRetryAttempts=%d, want 1", wiring.rcloneRetryAttempts)
	}
	if wiring.rcloneRetryBaseDelay != 0 {
		t.Fatalf("rcloneRetryBaseDelay=%s, want 0", wiring.rcloneRetryBaseDelay)
	}
	if wiring.rcloneRetryMaxDelay != 0 {
		t.Fatalf("rcloneRetryMaxDelay=%s, want 0", wiring.rcloneRetryMaxDelay)
	}
	if wiring.rcloneRetryJitterRatio != 1 {
		t.Fatalf("rcloneRetryJitterRatio=%v, want 1", wiring.rcloneRetryJitterRatio)
	}
	if wiring.rcloneTuneEnabled {
		t.Fatal("rcloneTuneEnabled=true, want false")
	}
	if !wiring.captureUnknownRcloneErrors {
		t.Fatal("captureUnknownRcloneErrors=false, want true")
	}
	if len(wiring.allowedLocalDirs) != 1 || wiring.allowedLocalDirs[0] != "/tmp/data" {
		t.Fatalf("allowedLocalDirs=%v, want [/tmp/data]", wiring.allowedLocalDirs)
	}
}

package jobs

import (
	"testing"
	"time"

	"s3desk/internal/rcloneerrors"
)

func TestRcloneRetryDelayExponentialBackoffWithoutJitter(t *testing.T) {
	m := &Manager{
		rcloneRetryBaseDelay:   time.Second,
		rcloneRetryMaxDelay:    8 * time.Second,
		rcloneRetryJitterRatio: 0,
	}

	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{attempt: 1, want: 1 * time.Second},
		{attempt: 2, want: 2 * time.Second},
		{attempt: 3, want: 4 * time.Second},
		{attempt: 4, want: 8 * time.Second},
		{attempt: 5, want: 8 * time.Second}, // capped by max delay
	}

	for _, tc := range cases {
		got := m.rcloneRetryDelay(tc.attempt, rcloneerrors.CodeNetworkError)
		if got != tc.want {
			t.Fatalf("attempt=%d delay=%s want=%s", tc.attempt, got, tc.want)
		}
	}
}

func TestRcloneRetryDelayRateLimitedUsesHigherBase(t *testing.T) {
	m := &Manager{
		rcloneRetryBaseDelay:   500 * time.Millisecond,
		rcloneRetryMaxDelay:    8 * time.Second,
		rcloneRetryJitterRatio: 0,
	}

	got := m.rcloneRetryDelay(1, rcloneerrors.CodeRateLimited)
	if got != time.Second {
		t.Fatalf("rate_limited delay=%s want=%s", got, time.Second)
	}
}

func TestRcloneRetryDelayAppliesJitterAndCap(t *testing.T) {
	m := &Manager{
		rcloneRetryBaseDelay:   time.Second,
		rcloneRetryMaxDelay:    5 * time.Second,
		rcloneRetryJitterRatio: 0.25,
		rcloneRetryRandFloat: func() float64 {
			return 1 // max positive jitter
		},
	}

	got := m.rcloneRetryDelay(1, rcloneerrors.CodeNetworkError)
	if got != 1250*time.Millisecond {
		t.Fatalf("jittered delay=%s want=%s", got, 1250*time.Millisecond)
	}

	m.rcloneRetryMaxDelay = 1100 * time.Millisecond
	got = m.rcloneRetryDelay(1, rcloneerrors.CodeNetworkError)
	if got != 1100*time.Millisecond {
		t.Fatalf("capped delay=%s want=%s", got, 1100*time.Millisecond)
	}
}

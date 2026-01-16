package jobs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/rcloneerrors"
)

func sleepWithContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (m *Manager) rcloneRetryDelay(attempt int, code rcloneerrors.Code) time.Duration {
	base := m.rcloneRetryBaseDelay
	if base <= 0 {
		base = 800 * time.Millisecond
	}
	if code == rcloneerrors.CodeRateLimited {
		base = base * 2
	}

	exp := attempt - 1
	if exp < 0 {
		exp = 0
	}
	delay := time.Duration(float64(base) * math.Pow(2, float64(exp)))
	maxDelay := m.rcloneRetryMaxDelay
	if maxDelay > 0 && delay > maxDelay {
		delay = maxDelay
	}
	if delay < 0 {
		delay = base
	}
	return delay
}

func (m *Manager) maybeCaptureUnknownRcloneError(profile models.ProfileSecrets, jobID, context, stderr string) {
	if !m.captureUnknownRcloneErrors {
		return
	}
	msg := strings.TrimSpace(stderr)
	if msg == "" {
		return
	}

	// Best-effort truncation. Keep it small to reduce accidental sensitive data exposure.
	if len(msg) > 8192 {
		msg = msg[:8192] + "\n...[truncated]\n"
	}

	sum := sha256.Sum256([]byte(context + "\n" + msg))
	short := hex.EncodeToString(sum[:4])
	ts := time.Now().UTC().Format("20060102T150405Z")
	name := fmt.Sprintf("%s_%s.txt", ts, short)

	dir := filepath.Join(m.dataDir, "logs", "rcloneerrors", "unknown")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return
	}

	header := fmt.Sprintf(
		"captured_at=%s\njob_id=%s\nprovider=%s\ncontext=%s\n\n",
		time.Now().UTC().Format(time.RFC3339Nano),
		jobID,
		profile.Provider,
		context,
	)
	_ = os.WriteFile(filepath.Join(dir, name), []byte(header+msg+"\n"), 0o600)
}

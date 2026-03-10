package jobs

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGetCachedResolvedRclonePathReturnsCachedNotFoundWithinTTL(t *testing.T) {
	resolvedRcloneCacheMu.Lock()
	resolvedRcloneCache = cachedResolvedRclone{
		env:        "",
		checkedAt:  time.Now(),
		errMessage: ErrRcloneNotFound.Error(),
		notFound:   true,
	}
	resolvedRcloneCacheMu.Unlock()
	t.Cleanup(func() {
		resolvedRcloneCacheMu.Lock()
		resolvedRcloneCache = cachedResolvedRclone{}
		resolvedRcloneCacheMu.Unlock()
	})

	path, err, ok := getCachedResolvedRclonePath("")
	if !ok {
		t.Fatal("expected cached resolve result")
	}
	if path != "" {
		t.Fatalf("path=%q, want empty", path)
	}
	if !errors.Is(err, ErrRcloneNotFound) {
		t.Fatalf("err=%v, want ErrRcloneNotFound", err)
	}
}

func TestGetCachedResolvedRclonePathExpiresFailureTTL(t *testing.T) {
	resolvedRcloneCacheMu.Lock()
	resolvedRcloneCache = cachedResolvedRclone{
		env:        "",
		checkedAt:  time.Now().Add(-rcloneResolveFailureTTL - time.Second),
		errMessage: ErrRcloneNotFound.Error(),
		notFound:   true,
	}
	resolvedRcloneCacheMu.Unlock()
	t.Cleanup(func() {
		resolvedRcloneCacheMu.Lock()
		resolvedRcloneCache = cachedResolvedRclone{}
		resolvedRcloneCacheMu.Unlock()
	})

	if _, _, ok := getCachedResolvedRclonePath(""); ok {
		t.Fatal("expected expired resolve failure cache to miss")
	}
}

func TestGetCachedCompatibleRcloneVersionReturnsCachedFailureWithinTTL(t *testing.T) {
	path := writeTempRcloneFingerprintFile(t, "rclone-binary")
	fingerprint, err := fingerprintRcloneBinary(path)
	if err != nil {
		t.Fatalf("fingerprint: %v", err)
	}
	compatibleRcloneCacheMu.Lock()
	compatibleRcloneCache = cachedCompatibleRclone{
		fingerprint: fingerprint,
		checkedAt:   time.Now(),
		version:     "rclone v1.40.0",
		errReason:   "version too old",
	}
	compatibleRcloneCacheMu.Unlock()
	t.Cleanup(func() {
		compatibleRcloneCacheMu.Lock()
		compatibleRcloneCache = cachedCompatibleRclone{}
		compatibleRcloneCacheMu.Unlock()
	})

	version, err, ok := getCachedCompatibleRcloneVersion(path)
	if !ok {
		t.Fatal("expected cached compatibility result")
	}
	if version != "rclone v1.40.0" {
		t.Fatalf("version=%q, want cached version", version)
	}
	var incompatible *RcloneIncompatibleError
	if !errors.As(err, &incompatible) {
		t.Fatalf("err=%v, want RcloneIncompatibleError", err)
	}
}

func TestGetCachedCompatibleRcloneVersionInvalidatesOnFingerprintChange(t *testing.T) {
	path := writeTempRcloneFingerprintFile(t, "rclone-binary")
	fingerprint, err := fingerprintRcloneBinary(path)
	if err != nil {
		t.Fatalf("fingerprint: %v", err)
	}
	compatibleRcloneCacheMu.Lock()
	compatibleRcloneCache = cachedCompatibleRclone{
		fingerprint: fingerprint,
		checkedAt:   time.Now(),
		version:     "rclone v1.66.0",
	}
	compatibleRcloneCacheMu.Unlock()
	t.Cleanup(func() {
		compatibleRcloneCacheMu.Lock()
		compatibleRcloneCache = cachedCompatibleRclone{}
		compatibleRcloneCacheMu.Unlock()
	})

	if err := os.WriteFile(path, []byte("changed-binary"), 0o700); err != nil {
		t.Fatalf("rewrite binary: %v", err)
	}
	if _, _, ok := getCachedCompatibleRcloneVersion(path); ok {
		t.Fatal("expected compatibility cache miss after fingerprint change")
	}
}

func writeTempRcloneFingerprintFile(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "rclone")
	if err := os.WriteFile(path, []byte(content), 0o700); err != nil {
		t.Fatalf("write temp binary: %v", err)
	}
	return path
}

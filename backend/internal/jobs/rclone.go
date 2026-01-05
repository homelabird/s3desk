package jobs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var ErrRcloneNotFound = errors.New("rclone not found in PATH (or set RCLONE_PATH)")

// RcloneIncompatibleError is returned when rclone is present but too old
// (or its version cannot be determined) for the flags S3Desk requires.
type RcloneIncompatibleError struct {
	CurrentVersion string
	MinVersion     string
	Reason         string
}

func (e *RcloneIncompatibleError) Error() string {
	cur := strings.TrimSpace(e.CurrentVersion)
	min := strings.TrimSpace(e.MinVersion)
	reason := strings.TrimSpace(e.Reason)
	if min == "" {
		min = MinSupportedRcloneVersion
	}
	if cur == "" {
		if reason != "" {
			return fmt.Sprintf("rclone is incompatible (requires >= %s): %s", min, reason)
		}
		return fmt.Sprintf("rclone is incompatible (requires >= %s)", min)
	}
	if reason != "" {
		return fmt.Sprintf("rclone %s is incompatible (requires >= %s): %s", cur, min, reason)
	}
	return fmt.Sprintf("rclone %s is incompatible (requires >= %s)", cur, min)
}

// MinSupportedRcloneVersion is the minimum rclone version required by S3Desk.
//
// This should be kept in sync with the set of flags we pass to rclone.
// Notably:
//   - --use-json-log was added in rclone v1.49.0
//   - --files-from-raw was added in rclone v1.52.0
//
// We require at least v1.52.0.
// See: https://rclone.org/changelog/ (v1.49.0 and v1.52 sections)
const MinSupportedRcloneVersion = "1.52.0"

type semver struct {
	major int
	minor int
	patch int
}

func (s semver) cmp(other semver) int {
	if s.major != other.major {
		if s.major < other.major {
			return -1
		}
		return 1
	}
	if s.minor != other.minor {
		if s.minor < other.minor {
			return -1
		}
		return 1
	}
	if s.patch != other.patch {
		if s.patch < other.patch {
			return -1
		}
		return 1
	}
	return 0
}

var rcloneVersionRe = regexp.MustCompile(`(?i)\bv?(\d+)\.(\d+)(?:\.(\d+))?`)

func parseSemver(s string) (v semver, ok bool) {
	m := rcloneVersionRe.FindStringSubmatch(s)
	if len(m) < 3 {
		return semver{}, false
	}
	maj, err := strconv.Atoi(m[1])
	if err != nil {
		return semver{}, false
	}
	min, err := strconv.Atoi(m[2])
	if err != nil {
		return semver{}, false
	}
	patch := 0
	if len(m) >= 4 && m[3] != "" {
		p, err := strconv.Atoi(m[3])
		if err != nil {
			return semver{}, false
		}
		patch = p
	}
	return semver{major: maj, minor: min, patch: patch}, true
}

func IsRcloneVersionCompatible(versionLine string) bool {
	cur, ok := parseSemver(versionLine)
	if !ok {
		return false
	}
	min, ok := parseSemver(MinSupportedRcloneVersion)
	if !ok {
		// Should never happen.
		return false
	}
	return cur.cmp(min) >= 0
}

func ResolveRclonePath() (string, error) {
	rclonePath := os.Getenv("RCLONE_PATH")
	if rclonePath == "" {
		if p, ok := findLocalRclone(); ok {
			return p, nil
		}
		p, err := exec.LookPath("rclone")
		if err != nil {
			return "", ErrRcloneNotFound
		}
		return p, nil
	}

	if _, err := os.Stat(rclonePath); err != nil {
		return "", fmt.Errorf("invalid RCLONE_PATH %q: %w", rclonePath, err)
	}
	return rclonePath, nil
}

func DetectRclone() (path string, ok bool) {
	p, err := ResolveRclonePath()
	if err != nil {
		return "", false
	}
	return p, true
}

func DetectRcloneVersion(ctx context.Context) (version string, ok bool) {
	path, ok := DetectRclone()
	if !ok {
		return "", false
	}
	return DetectRcloneVersionAtPath(ctx, path)
}

func DetectRcloneVersionAtPath(ctx context.Context, path string) (version string, ok bool) {
	callCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	out, err := exec.CommandContext(callCtx, path, "version").Output()
	if err != nil {
		return "", false
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 {
		return "", false
	}
	v := strings.TrimSpace(lines[0])
	if v == "" {
		return "", false
	}
	return v, true
}

// EnsureRcloneCompatible resolves rclone and verifies that its version is compatible.
// It returns the resolved path and the detected version line.
func EnsureRcloneCompatible(ctx context.Context) (path string, version string, err error) {
	path, err = ResolveRclonePath()
	if err != nil {
		return "", "", err
	}

	ver, ok := DetectRcloneVersionAtPath(ctx, path)
	if !ok {
		return path, "", &RcloneIncompatibleError{MinVersion: MinSupportedRcloneVersion, Reason: "unable to determine rclone version"}
	}
	if !IsRcloneVersionCompatible(ver) {
		return path, ver, &RcloneIncompatibleError{CurrentVersion: ver, MinVersion: MinSupportedRcloneVersion, Reason: "version too old"}
	}
	return path, ver, nil
}

// TransferEngineJobError wraps transfer-engine failures in a jobError so that the
// job gets a stable error_code in the DB and UI.
func TransferEngineJobError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrRcloneNotFound) {
		code := ErrorCodeTransferEngineMissing
		return newJobError(code, FormatJobErrorMessage(err.Error(), code), err)
	}
	var ie *RcloneIncompatibleError
	if errors.As(err, &ie) {
		code := ErrorCodeTransferEngineIncompatible
		return newJobError(code, FormatJobErrorMessage(ie.Error(), code), err)
	}
	return err
}

func findLocalRclone() (path string, ok bool) {
	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "rclone"),
			filepath.Join(exeDir, "bin", "rclone"),
		)
	}
	candidates = append(candidates,
		filepath.Join(".tools", "bin", "rclone"),
		filepath.Join("..", ".tools", "bin", "rclone"),
		filepath.Join("dist", "bin", "rclone"),
		filepath.Join("..", "dist", "bin", "rclone"),
	)
	for _, p := range candidates {
		info, err := os.Stat(p)
		if err != nil || info.IsDir() {
			continue
		}
		return p, true
	}
	return "", false
}

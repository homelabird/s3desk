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
	"sync"
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

type rcloneBinaryFingerprint struct {
	path        string
	size        int64
	modUnixNano int64
}

type cachedResolvedRclone struct {
	env         string
	path        string
	fingerprint rcloneBinaryFingerprint
	checkedAt   time.Time
	errMessage  string
	notFound    bool
}

type cachedCompatibleRclone struct {
	fingerprint rcloneBinaryFingerprint
	checkedAt   time.Time
	version     string
	errReason   string
}

var (
	resolvedRcloneCacheMu   sync.Mutex
	resolvedRcloneCache     cachedResolvedRclone
	compatibleRcloneCacheMu sync.Mutex
	compatibleRcloneCache   cachedCompatibleRclone
)

const (
	rcloneResolveFailureTTL       = 5 * time.Second
	rcloneCompatibilitySuccessTTL = 30 * time.Second
	rcloneCompatibilityFailureTTL = 5 * time.Second
)

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
	if cachedPath, cachedErr, ok := getCachedResolvedRclonePath(rclonePath); ok {
		return cachedPath, cachedErr
	}
	return resolveRclonePathUncached(rclonePath)
}

func resolveRclonePathUncached(rclonePath string) (string, error) {
	if rclonePath == "" {
		if p, ok := findLocalRclone(); ok {
			setCachedResolvedRclonePath("", p)
			return p, nil
		}
		p, err := exec.LookPath("rclone")
		if err != nil {
			setCachedResolvedRcloneError("", ErrRcloneNotFound)
			return "", ErrRcloneNotFound
		}
		setCachedResolvedRclonePath("", p)
		return p, nil
	}

	if _, err := os.Stat(rclonePath); err != nil {
		cachedErr := fmt.Errorf("invalid RCLONE_PATH %q: %w", rclonePath, err)
		setCachedResolvedRcloneError(rclonePath, cachedErr)
		return "", cachedErr
	}
	setCachedResolvedRclonePath(rclonePath, rclonePath)
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
	if testEnsureRcloneCompatibleHook != nil {
		return testEnsureRcloneCompatibleHook(ctx)
	}
	path, err = ResolveRclonePath()
	if err != nil {
		return "", "", err
	}
	if cachedVersion, cachedErr, ok := getCachedCompatibleRcloneVersion(path); ok {
		return path, cachedVersion, cachedErr
	}

	ver, ok := DetectRcloneVersionAtPath(ctx, path)
	if !ok {
		err = &RcloneIncompatibleError{MinVersion: MinSupportedRcloneVersion, Reason: "unable to determine rclone version"}
		setCachedCompatibleRcloneFailure(path, "", "unable to determine rclone version")
		return path, "", err
	}
	if !IsRcloneVersionCompatible(ver) {
		err = &RcloneIncompatibleError{CurrentVersion: ver, MinVersion: MinSupportedRcloneVersion, Reason: "version too old"}
		setCachedCompatibleRcloneFailure(path, ver, "version too old")
		return path, ver, err
	}
	setCachedCompatibleRcloneVersion(path, ver)
	return path, ver, nil
}

func getCachedResolvedRclonePath(env string) (string, error, bool) {
	resolvedRcloneCacheMu.Lock()
	cached := resolvedRcloneCache
	resolvedRcloneCacheMu.Unlock()
	if cached.env != env {
		return "", nil, false
	}
	if cached.errMessage != "" {
		if time.Since(cached.checkedAt) <= rcloneResolveFailureTTL {
			if cached.notFound {
				return "", ErrRcloneNotFound, true
			}
			return "", errors.New(cached.errMessage), true
		}
		clearCachedResolvedRclone(env, "")
		return "", nil, false
	}
	if cached.path == "" || cached.fingerprint.path == "" {
		return "", nil, false
	}
	current, err := fingerprintRcloneBinary(cached.fingerprint.path)
	if err != nil || current != cached.fingerprint {
		clearCachedResolvedRclonePath(env, cached.fingerprint.path)
		return "", nil, false
	}
	return cached.path, nil, true
}

func setCachedResolvedRclonePath(env, path string) {
	fingerprint, err := fingerprintRcloneBinary(path)
	if err != nil {
		return
	}
	resolvedRcloneCacheMu.Lock()
	resolvedRcloneCache = cachedResolvedRclone{
		env:         env,
		path:        path,
		fingerprint: fingerprint,
		checkedAt:   time.Now(),
	}
	resolvedRcloneCacheMu.Unlock()
}

func setCachedResolvedRcloneError(env string, err error) {
	if err == nil {
		return
	}
	resolvedRcloneCacheMu.Lock()
	resolvedRcloneCache = cachedResolvedRclone{
		env:        env,
		checkedAt:  time.Now(),
		errMessage: err.Error(),
		notFound:   errors.Is(err, ErrRcloneNotFound),
	}
	resolvedRcloneCacheMu.Unlock()
}

func clearCachedResolvedRclonePath(env, path string) {
	resolvedRcloneCacheMu.Lock()
	if resolvedRcloneCache.env == env && resolvedRcloneCache.fingerprint.path == path {
		resolvedRcloneCache = cachedResolvedRclone{}
	}
	resolvedRcloneCacheMu.Unlock()
}

func clearCachedResolvedRclone(env, path string) {
	resolvedRcloneCacheMu.Lock()
	if resolvedRcloneCache.env == env && (path == "" || resolvedRcloneCache.fingerprint.path == path || resolvedRcloneCache.path == path) {
		resolvedRcloneCache = cachedResolvedRclone{}
	}
	resolvedRcloneCacheMu.Unlock()
}

func getCachedCompatibleRcloneVersion(path string) (string, error, bool) {
	compatibleRcloneCacheMu.Lock()
	cached := compatibleRcloneCache
	compatibleRcloneCacheMu.Unlock()
	if cached.fingerprint.path != path {
		return "", nil, false
	}
	current, err := fingerprintRcloneBinary(path)
	if err != nil || current != cached.fingerprint {
		clearCachedCompatibleRcloneVersion(path)
		return "", nil, false
	}
	ttl := rcloneCompatibilitySuccessTTL
	if cached.errReason != "" {
		ttl = rcloneCompatibilityFailureTTL
	}
	if time.Since(cached.checkedAt) > ttl {
		clearCachedCompatibleRcloneVersion(path)
		return "", nil, false
	}
	if cached.errReason == "" {
		return cached.version, nil, true
	}
	return cached.version, &RcloneIncompatibleError{
		CurrentVersion: cached.version,
		MinVersion:     MinSupportedRcloneVersion,
		Reason:         cached.errReason,
	}, true
}

func setCachedCompatibleRcloneVersion(path, version string) {
	fingerprint, err := fingerprintRcloneBinary(path)
	if err != nil {
		return
	}
	compatibleRcloneCacheMu.Lock()
	compatibleRcloneCache = cachedCompatibleRclone{
		fingerprint: fingerprint,
		checkedAt:   time.Now(),
		version:     version,
	}
	compatibleRcloneCacheMu.Unlock()
}

func setCachedCompatibleRcloneFailure(path, version, reason string) {
	fingerprint, err := fingerprintRcloneBinary(path)
	if err != nil {
		return
	}
	compatibleRcloneCacheMu.Lock()
	compatibleRcloneCache = cachedCompatibleRclone{
		fingerprint: fingerprint,
		checkedAt:   time.Now(),
		version:     version,
		errReason:   reason,
	}
	compatibleRcloneCacheMu.Unlock()
}

func clearCachedCompatibleRcloneVersion(path string) {
	compatibleRcloneCacheMu.Lock()
	if compatibleRcloneCache.fingerprint.path == path {
		compatibleRcloneCache = cachedCompatibleRclone{}
	}
	compatibleRcloneCacheMu.Unlock()
}

func fingerprintRcloneBinary(path string) (rcloneBinaryFingerprint, error) {
	info, err := os.Stat(path)
	if err != nil {
		return rcloneBinaryFingerprint{}, err
	}
	return rcloneBinaryFingerprint{
		path:        path,
		size:        info.Size(),
		modUnixNano: info.ModTime().UnixNano(),
	}, nil
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

func isTransferEngineError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrRcloneNotFound) {
		return true
	}
	var ie *RcloneIncompatibleError
	return errors.As(err, &ie)
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

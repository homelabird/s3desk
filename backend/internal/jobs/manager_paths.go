package jobs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"s3desk/internal/rcloneconfig"
)

func (m *Manager) ensureLocalPathAllowed(localPath string) error {
	if len(m.allowedLocalDirs) == 0 {
		return nil
	}

	abs, err := filepath.Abs(localPath)
	if err != nil {
		return fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return fmt.Errorf("localPath %q not found: %w", localPath, err)
	}

	for _, dir := range m.allowedLocalDirs {
		if isUnderDir(dir, real) {
			return nil
		}
	}

	return fmt.Errorf("localPath %q is not allowed; must be under one of: %s", real, strings.Join(m.allowedLocalDirs, ", "))
}

func (m *Manager) prepareLocalDestination(localPath string) (string, error) {
	clean := filepath.Clean(localPath)
	if clean == "" || clean == "." {
		return "", fmt.Errorf("invalid localPath %q", localPath)
	}
	abs, err := filepath.Abs(clean)
	if err != nil {
		return "", fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}

	if err := m.ensureLocalPathAllowedForCreate(abs); err != nil {
		return "", err
	}

	if info, err := os.Stat(abs); err == nil {
		if !info.IsDir() {
			return "", fmt.Errorf("localPath %q must be a directory", abs)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("invalid localPath %q: %w", abs, err)
	} else {
		if err := os.MkdirAll(abs, 0o700); err != nil {
			return "", fmt.Errorf("failed to create localPath %q: %w", abs, err)
		}
	}

	// Normalize to a directory target for transfer operations.
	if !strings.HasSuffix(abs, string(os.PathSeparator)) {
		abs += string(os.PathSeparator)
	}
	return abs, nil
}

func (m *Manager) ensureLocalPathAllowedForCreate(localPath string) error {
	if len(m.allowedLocalDirs) == 0 {
		return nil
	}

	abs, err := filepath.Abs(localPath)
	if err != nil {
		return fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}

	real, err := evalSymlinksBestEffort(abs)
	if err != nil {
		return fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}

	for _, dir := range m.allowedLocalDirs {
		if isUnderDir(dir, real) {
			return nil
		}
	}
	return fmt.Errorf("localPath %q is not allowed; must be under one of: %s", real, strings.Join(m.allowedLocalDirs, ", "))
}

func isUnderDir(dir, path string) bool {
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return false
	}
	return true
}

func evalSymlinksBestEffort(path string) (string, error) {
	clean := filepath.Clean(path)
	if clean == "" || clean == "." {
		return "", errors.New("invalid path")
	}

	p := clean
	var missing []string
	for {
		info, err := os.Stat(p)
		if err == nil {
			if !info.IsDir() && len(missing) > 0 {
				return "", fmt.Errorf("parent is not a directory: %q", p)
			}
			real, err := filepath.EvalSymlinks(p)
			if err != nil {
				return "", err
			}
			for i := len(missing) - 1; i >= 0; i-- {
				real = filepath.Join(real, missing[i])
			}
			return real, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}

		parent := filepath.Dir(p)
		if parent == p {
			real, err := filepath.EvalSymlinks(p)
			if err != nil {
				return "", err
			}
			for i := len(missing) - 1; i >= 0; i-- {
				real = filepath.Join(real, missing[i])
			}
			return real, nil
		}

		missing = append(missing, filepath.Base(p))
		p = parent
	}
}

func normalizeKeyInput(value string, preserveLeadingSlash bool) string {
	return rcloneconfig.NormalizePathInput(value, preserveLeadingSlash)
}

func rcloneRemoteBucket(bucket string) string {
	return rcloneconfig.RemoteBucket(bucket)
}

func rcloneRemoteDir(bucket, prefix string, preserveLeadingSlash bool) string {
	return rcloneconfig.RemoteDir(bucket, prefix, preserveLeadingSlash)
}

func rcloneRemoteObject(bucket, key string, preserveLeadingSlash bool) string {
	return rcloneconfig.RemoteObject(bucket, key, preserveLeadingSlash)
}

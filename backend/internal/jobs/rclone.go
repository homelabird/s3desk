package jobs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

var ErrRcloneNotFound = errors.New("rclone not found in PATH (or set RCLONE_PATH)")

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

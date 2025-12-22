package jobs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

var ErrS5CmdNotFound = errors.New("s5cmd not found in PATH (or set S5CMD_PATH)")

func ResolveS5CmdPath() (string, error) {
	s5cmdPath := os.Getenv("S5CMD_PATH")
	if s5cmdPath == "" {
		if p, ok := findLocalS5Cmd(); ok {
			return p, nil
		}
		p, err := exec.LookPath("s5cmd")
		if err != nil {
			return "", ErrS5CmdNotFound
		}
		return p, nil
	}

	if _, err := os.Stat(s5cmdPath); err != nil {
		return "", fmt.Errorf("invalid S5CMD_PATH %q: %w", s5cmdPath, err)
	}
	return s5cmdPath, nil
}

func DetectS5Cmd() (path string, ok bool) {
	p, err := ResolveS5CmdPath()
	if err != nil {
		return "", false
	}
	return p, true
}

func DetectS5CmdVersion(ctx context.Context) (version string, ok bool) {
	path, ok := DetectS5Cmd()
	if !ok {
		return "", false
	}

	callCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	out, err := exec.CommandContext(callCtx, path, "version").Output()
	if err != nil {
		return "", false
	}
	v := strings.TrimSpace(string(out))
	if v == "" {
		return "", false
	}
	return v, true
}

package jobs

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestRunRcloneAttemptDrainsLogsBeforeWait(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone helper uses a POSIX shell")
	}

	tempDir := t.TempDir()
	rclonePath := filepath.Join(tempDir, "rclone")
	script := `#!/bin/sh
set -eu
printf '%s\n' "$1" >&2
sleep 0.1
printf 'final error detail\n' >&2
touch "$2"
`
	if err := os.WriteFile(rclonePath, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(tempDir, "job.log")
	writer, err := openJobLogWriter(logPath, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()

	// Delay the log sink until the process exits with unread pipe data.
	writer.mu.Lock()
	locked := true
	defer func() {
		if locked {
			writer.mu.Unlock()
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	manager := NewManager(Config{})
	finishedPath := filepath.Join(tempDir, "finished")
	type result struct {
		capture string
		err     error
	}
	done := make(chan result, 1)
	go func() {
		capture, err := manager.runRcloneAttempt(ctx, rclonePath, []string{strings.Repeat("x", logReadBufferSize), finishedPath}, "job-tail", writer, runRcloneOptions{})
		done <- result{capture: capture, err: err}
	}()
	for {
		if _, err := os.Stat(finishedPath); err == nil {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal("fake process did not finish")
		case <-time.After(10 * time.Millisecond):
		}
	}
	time.Sleep(50 * time.Millisecond)
	writer.mu.Unlock()
	locked = false

	select {
	case result := <-done:
		if result.err != nil {
			t.Fatalf("runRcloneAttempt: %v", result.err)
		}
		if !strings.Contains(result.capture, "final error detail") {
			t.Fatal("stderr capture lost the final error detail")
		}
	case <-ctx.Done():
		t.Fatal("runRcloneAttempt did not finish")
	}
	logBytes, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(logBytes), "final error detail") {
		t.Fatal("job log lost the final error detail")
	}
}

func TestRunRcloneAttemptBoundsInheritedOutputPipes(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone helper uses a POSIX shell")
	}
	rclonePath := writeInheritedPipeFakeRcloneScript(t)
	writer, err := openJobLogWriter(filepath.Join(t.TempDir(), "job.log"), 0)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), rclonePipeDrainTimeout+3*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		capture, err := NewManager(Config{}).runRcloneAttempt(ctx, rclonePath, nil, "job-inherited", writer, runRcloneOptions{})
		if !strings.Contains(capture, "final error detail") {
			err = errors.New("stderr capture lost the final error detail")
		}
		done <- err
	}()
	select {
	case err := <-done:
		if !errors.Is(err, exec.ErrWaitDelay) {
			t.Fatalf("runRcloneAttempt: %v, want ErrWaitDelay for inherited pipes", err)
		}
	case <-ctx.Done():
		t.Fatal("runRcloneAttempt waited for the descendant's inherited pipes")
	}
}

func TestRunRcloneAttemptCancellationStopsProcess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone helper uses a POSIX shell")
	}
	rclonePath := writeCancelableFakeRcloneScript(t, "ignore")
	logPath := filepath.Join(t.TempDir(), "job.log")
	writer, err := openJobLogWriter(logPath, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := NewManager(Config{}).runRcloneAttempt(ctx, rclonePath, []string{"cat"}, "job-cancel", writer, runRcloneOptions{})
		done <- err
	}()
	deadline := time.After(5 * time.Second)
	for {
		logs, _ := os.ReadFile(logPath)
		if strings.Contains(string(logs), "ready") {
			break
		}
		select {
		case err := <-done:
			t.Fatalf("runRcloneAttempt exited before readiness: %v", err)
		case <-deadline:
			t.Fatal("fake process did not become ready")
		case <-time.After(10 * time.Millisecond):
		}
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("runRcloneAttempt succeeded after forced cancellation")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("runRcloneAttempt did not stop after cancellation")
	}
}

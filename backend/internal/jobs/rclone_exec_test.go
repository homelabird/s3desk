package jobs

import (
	"bufio"
	"context"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"s3desk/internal/models"
)

func TestStartRcloneCommandWaitDrainsUnreadStdout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone helper uses a POSIX shell")
	}

	installJobsEnsureRclonePath(t, writeFakeRcloneScript(t))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	manager := NewManager(Config{DataDir: t.TempDir()})
	proc, err := manager.startRcloneCommand(ctx, testRcloneExecProfile(), "job-drain", []string{"cat", "remote:object"})
	if err != nil {
		t.Fatalf("startRcloneCommand: %v", err)
	}

	buf := make([]byte, len("prefix\n"))
	if _, err := io.ReadFull(proc.stdout, buf); err != nil {
		t.Fatalf("read prefix: %v", err)
	}
	if got := string(buf); got != "prefix\n" {
		t.Fatalf("prefix=%q want=%q", got, "prefix\n")
	}

	done := make(chan error, 1)
	go func() {
		done <- proc.wait()
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("wait: %v", err)
		}
	case <-time.After(2 * time.Second):
		cancel()
		select {
		case err := <-done:
			t.Fatalf("wait hung until context cancellation: %v", err)
		case <-time.After(2 * time.Second):
			t.Fatal("wait remained hung after context cancellation")
		}
	}
}

func TestComputeS3PrefixTotalsReturnsWhenListStopsEarly(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone helper uses a POSIX shell")
	}

	installJobsEnsureRclonePath(t, writeFakeRcloneScript(t))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	manager := NewManager(Config{DataDir: t.TempDir()})
	results := make(chan struct {
		totals s3PrefixTotals
		ok     bool
		err    error
	}, 1)
	go func() {
		totals, ok, err := computeS3PrefixTotals(ctx, manager, testRcloneExecProfile(), "job-totals", "bucket", "", nil, nil, 1, false)
		results <- struct {
			totals s3PrefixTotals
			ok     bool
			err    error
		}{totals: totals, ok: ok, err: err}
	}()

	select {
	case result := <-results:
		if result.err != nil {
			t.Fatalf("computeS3PrefixTotals: %v", result.err)
		}
		if result.ok {
			t.Fatal("ok=true want false when listing exceeds maxObjects")
		}
		if result.totals != (s3PrefixTotals{}) {
			t.Fatalf("totals=%+v want zero-value totals when maxObjects is exceeded", result.totals)
		}
	case <-time.After(2 * time.Second):
		cancel()
		select {
		case result := <-results:
			t.Fatalf("computeS3PrefixTotals hung until context cancellation: ok=%v err=%v totals=%+v", result.ok, result.err, result.totals)
		case <-time.After(2 * time.Second):
			t.Fatal("computeS3PrefixTotals remained hung after context cancellation")
		}
	}
}

func TestStartRcloneCommandCancelGracefulShutdown(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone helper uses a POSIX shell")
	}

	installJobsEnsureRclonePath(t, writeCancelableFakeRcloneScript(t, "graceful"))

	ctx, cancel := context.WithCancel(context.Background())
	manager := NewManager(Config{DataDir: t.TempDir()})
	proc, err := manager.startRcloneCommand(ctx, testRcloneExecProfile(), "job-graceful", []string{"cat", "remote:object"})
	if err != nil {
		cancel()
		t.Fatalf("startRcloneCommand: %v", err)
	}

	reader := bufio.NewReader(proc.stdout)
	line, err := reader.ReadString('\n')
	if err != nil {
		cancel()
		t.Fatalf("read ready line: %v", err)
	}
	if line != "ready\n" {
		cancel()
		t.Fatalf("ready line=%q want=%q", line, "ready\n")
	}

	cancel()

	done := make(chan error, 1)
	go func() {
		done <- proc.wait()
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("wait after graceful cancel: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("wait hung after graceful cancel")
	}
}

func TestStartRcloneCommandCancelFallsBackToSigkill(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone helper uses a POSIX shell")
	}

	installJobsEnsureRclonePath(t, writeCancelableFakeRcloneScript(t, "ignore"))

	ctx, cancel := context.WithCancel(context.Background())
	manager := NewManager(Config{DataDir: t.TempDir()})
	proc, err := manager.startRcloneCommand(ctx, testRcloneExecProfile(), "job-force-kill", []string{"cat", "remote:object"})
	if err != nil {
		cancel()
		t.Fatalf("startRcloneCommand: %v", err)
	}

	reader := bufio.NewReader(proc.stdout)
	line, err := reader.ReadString('\n')
	if err != nil {
		cancel()
		t.Fatalf("read ready line: %v", err)
	}
	if line != "ready\n" {
		cancel()
		t.Fatalf("ready line=%q want=%q", line, "ready\n")
	}

	cancel()

	done := make(chan error, 1)
	go func() {
		done <- proc.wait()
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("wait succeeded want process kill error")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("wait hung after forced cancel")
	}
}

func installJobsEnsureRclonePath(t *testing.T, path string) {
	t.Helper()
	restore := SetProcessTestHooks(
		func(context.Context) (string, string, error) {
			return path, "rclone v1.66.0", nil
		},
		nil,
	)
	t.Cleanup(restore)
}

func testRcloneExecProfile() models.ProfileSecrets {
	return models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}
}

func writeFakeRcloneScript(t *testing.T) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "rclone")
	script := `#!/bin/sh
set -eu

mode=""
for arg in "$@"; do
	case "$arg" in
		version)
			echo "rclone v1.66.0"
			exit 0
			;;
		lsjson)
			mode="lsjson"
			;;
		cat)
			mode="cat"
			;;
	esac
done

case "$mode" in
	lsjson)
		printf '['
		i=0
		while [ "$i" -lt 4096 ]; do
			if [ "$i" -gt 0 ]; then
				printf ','
			fi
			printf '{"Path":"file%05d","Name":"file%05d","Size":1}' "$i" "$i"
			i=$((i + 1))
		done
		printf ']'
		;;
	cat)
		printf 'prefix\n'
		i=0
		while [ "$i" -lt 4096 ]; do
			printf 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
			i=$((i + 1))
		done
		;;
	*)
		exit 0
		;;
esac
`
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatalf("write fake rclone: %v", err)
	}
	return path
}

func writeCancelableFakeRcloneScript(t *testing.T, mode string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "rclone")
	trapCmd := "trap 'exit 0' TERM"
	if mode == "ignore" {
		trapCmd = "trap '' TERM"
	}
	script := `#!/bin/sh
set -eu

mode=""
for arg in "$@"; do
	case "$arg" in
		version)
			echo "rclone v1.66.0"
			exit 0
			;;
		cat)
			mode="cat"
			;;
	esac
done

case "$mode" in
	cat)
		` + trapCmd + `
		printf 'ready\n'
		while :; do
			sleep 0.05
		done
		;;
	*)
		exit 0
		;;
esac
`
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatalf("write cancelable fake rclone: %v", err)
	}
	return path
}

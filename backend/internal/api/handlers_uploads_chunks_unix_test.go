//go:build !windows

package api

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func TestTryAssembleChunkFileRecoversAfterProcessExit(t *testing.T) {
	const helperDirEnv = "S3DESK_TEST_INTERRUPTED_ASSEMBLY_DIR"
	relOS := filepath.FromSlash("nested/file.bin")
	if stagingDir := os.Getenv(helperDirEnv); stagingDir != "" {
		err := tryAssembleChunkFile(context.Background(), stagingDir, relOS, filepath.Join(stagingDir, ".chunks", relOS), 2)
		t.Fatalf("assembly returned before the process was stopped: %v", err)
	}

	t.Parallel()
	stagingDir := t.TempDir()
	chunkDir := filepath.Join(stagingDir, ".chunks", relOS)
	if err := os.MkdirAll(chunkDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(0)), []byte("hello "), 0o600); err != nil {
		t.Fatal(err)
	}
	blockedPart := filepath.Join(chunkDir, chunkPartName(1))
	if err := unix.Mkfifo(blockedPart, 0o600); err != nil {
		t.Fatal(err)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, "-test.run=^TestTryAssembleChunkFileRecoversAfterProcessExit$")
	cmd.Env = append(os.Environ(), helperDirEnv+"="+stagingDir)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if cmd.ProcessState == nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}()

	// Opening the writer succeeds only once assembly has reached the second part.
	// Keep it empty so the process stays inside the copy until it is killed.
	var writer int
	for {
		writer, err = unix.Open(blockedPart, unix.O_WRONLY|unix.O_NONBLOCK, 0)
		if err == nil {
			break
		}
		if err != unix.ENXIO {
			t.Fatalf("open blocked part: %v", err)
		}
		select {
		case <-ctx.Done():
			t.Fatal("assembly did not reach the second part")
		case <-time.After(10 * time.Millisecond):
		}
	}
	if err := cmd.Process.Kill(); err != nil {
		_ = unix.Close(writer)
		t.Fatal(err)
	}
	_ = cmd.Wait()
	_ = unix.Close(writer)
	if err := os.Remove(blockedPart); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(blockedPart, []byte("world"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := tryAssembleChunkFile(context.Background(), stagingDir, relOS, chunkDir, 2); err != nil {
		t.Fatalf("retry assembly: %v", err)
	}
	body, err := os.ReadFile(filepath.Join(stagingDir, relOS))
	if err != nil || string(body) != "hello world" {
		t.Fatalf("assembled body=%q, err=%v", body, err)
	}
	if pending, err := findPendingStagingArtifact(stagingDir); err != nil || pending != "" {
		t.Fatalf("staging is still blocked from commit: pending=%q, err=%v", pending, err)
	}
}

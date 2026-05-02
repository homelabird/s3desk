package jobs

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"testing"
	"time"
)

func TestTerminateJobProcessWithTimeoutsGraceful(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("process group tests use POSIX signals")
	}

	cmd := startProcessGroupHelper(t, "graceful")
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- cmd.Wait()
	}()

	usedSigkill, err := terminateJobProcessWithTimeouts("job-term", cmd.Process.Pid, 250*time.Millisecond, time.Second, 20*time.Millisecond)
	if err != nil {
		t.Fatalf("terminateJobProcessWithTimeouts: %v", err)
	}
	if usedSigkill {
		t.Fatal("usedSigkill=true want false for graceful shutdown")
	}
	if err := <-waitDone; err != nil {
		t.Fatalf("wait after graceful shutdown: %v", err)
	}
}

func TestTerminateJobProcessWithTimeoutsFallsBackToSigkill(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("process group tests use POSIX signals")
	}

	cmd := startProcessGroupHelper(t, "ignore")
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- cmd.Wait()
	}()

	usedSigkill, err := terminateJobProcessWithTimeouts("job-kill", cmd.Process.Pid, 150*time.Millisecond, time.Second, 20*time.Millisecond)
	if err != nil {
		t.Fatalf("terminateJobProcessWithTimeouts: %v", err)
	}
	if !usedSigkill {
		t.Fatal("usedSigkill=false want true when process ignores SIGTERM")
	}
	if err := <-waitDone; err == nil {
		t.Fatal("wait succeeded want killed process error")
	}
}

func TestTerminateJobProcessWithTimeoutsNoopsInvalidPID(t *testing.T) {
	usedSigkill, err := terminateJobProcessWithTimeouts("job-noop", -1, time.Millisecond, time.Millisecond, time.Millisecond)
	if err != nil {
		t.Fatalf("terminateJobProcessWithTimeouts: %v", err)
	}
	if usedSigkill {
		t.Fatal("usedSigkill=true want false for invalid pid no-op")
	}
}

func TestTerminateJobProcessWithTimeoutsRejectsCurrentProcessPID(t *testing.T) {
	usedSigkill, err := terminateJobProcessWithTimeouts("job-self", os.Getpid(), time.Millisecond, time.Millisecond, time.Millisecond)
	if !errors.Is(err, errProcessSelfTermination) {
		t.Fatalf("err=%v, want errProcessSelfTermination", err)
	}
	if usedSigkill {
		t.Fatal("usedSigkill=true want false when rejecting current process")
	}
}

func TestProcessTerminationSafetyHelpersRejectCurrentProcess(t *testing.T) {
	if !IsSelfPID(os.Getpid()) {
		t.Fatal("IsSelfPID returned false for current process")
	}
	if err := CanTerminate(os.Getpid()); !errors.Is(err, errProcessSelfTermination) {
		t.Fatalf("CanTerminate err=%v, want errProcessSelfTermination", err)
	}
	if err := TryTerminate(os.Getpid()); !errors.Is(err, errProcessSelfTermination) {
		t.Fatalf("TryTerminate err=%v, want errProcessSelfTermination", err)
	}
	if err := ForceTerminate(os.Getpid()); !errors.Is(err, errProcessSelfTermination) {
		t.Fatalf("ForceTerminate err=%v, want errProcessSelfTermination", err)
	}
}

func TestProcessKillHelper(t *testing.T) {
	mode := os.Getenv("S3DESK_PROCESS_KILL_HELPER")
	if mode == "" {
		t.Skip("helper process only")
	}

	switch mode {
	case "graceful":
		signals := make(chan os.Signal, 1)
		signal.Notify(signals, syscall.SIGTERM)
		defer signal.Stop(signals)
		fmt.Println("ready")
		<-signals
		os.Exit(0)
	case "ignore":
		signal.Ignore(syscall.SIGTERM)
		fmt.Println("ready")
		for {
			time.Sleep(50 * time.Millisecond)
		}
	default:
		t.Fatalf("unknown helper mode %q", mode)
	}
}

func startProcessGroupHelper(t *testing.T, mode string) *exec.Cmd {
	t.Helper()

	cmd := exec.Command(os.Args[0], "-test.run=TestProcessKillHelper")
	cmd.Env = append(os.Environ(), "S3DESK_PROCESS_KILL_HELPER="+mode)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatalf("stdout pipe: %v", err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatalf("start helper: %v", err)
	}
	ready := make(chan error, 1)
	go func() {
		reader := bufio.NewReader(stdout)
		line, err := reader.ReadString('\n')
		if err != nil {
			ready <- err
			return
		}
		if line != "ready\n" {
			ready <- fmt.Errorf("unexpected helper banner %q", line)
			return
		}
		ready <- nil
	}()
	select {
	case err := <-ready:
		if err != nil {
			t.Fatalf("wait for helper readiness: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for helper readiness")
	}
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	})
	return cmd
}

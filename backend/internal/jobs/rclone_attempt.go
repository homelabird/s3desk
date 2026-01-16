package jobs

import (
	"context"
	"os/exec"
	"sync"
	"syscall"
)

// runRcloneAttempt executes a single rclone invocation and streams logs to the job log.
// It returns a compact stderr capture (last N lines) and the rclone process wait error.
func (m *Manager) runRcloneAttempt(ctx context.Context, rclonePath string, args []string, jobID string, logWriter *jobLogWriter, opts runRcloneOptions) (stderrCapture string, waitErr error) {
	cmd := exec.CommandContext(ctx, rclonePath, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return "", err
	}

	if err := cmd.Start(); err != nil {
		return "", err
	}

	pid := 0
	m.mu.Lock()
	if cmd.Process != nil {
		pid = cmd.Process.Pid
		m.pids[jobID] = pid
	}
	m.mu.Unlock()

	var (
		progressCh   chan rcloneStatsUpdate
		progressDone chan struct{}
	)
	if opts.TrackProgress {
		progressCh = make(chan rcloneStatsUpdate, 128)
		progressDone = make(chan struct{})
		go func() {
			defer close(progressDone)
			m.trackRcloneProgress(ctx, jobID, progressCh)
		}()
	}

	done := make(chan struct{})
	if pid > 0 {
		go func(pid int) {
			select {
			case <-ctx.Done():
				_ = syscall.Kill(-pid, syscall.SIGKILL)
			case <-done:
			}
		}(pid)
	}

	errCapture := newLogCapture(50)

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		m.pipeLogs(ctx, stdout, logWriter, jobID, "info", nil, progressCh, opts.ProgressMode, m.logLineMaxBytes)
	}()
	go func() {
		defer wg.Done()
		m.pipeLogs(ctx, stderrPipe, logWriter, jobID, "error", errCapture, progressCh, opts.ProgressMode, m.logLineMaxBytes)
	}()

	waitErr = cmd.Wait()
	close(done)

	// Ensure Cancel(jobID) cannot accidentally kill an unrelated PID after the rclone process exits.
	if pid > 0 {
		m.mu.Lock()
		if m.pids[jobID] == pid {
			m.pids[jobID] = 0
		}
		m.mu.Unlock()
	}

	wg.Wait()

	if progressCh != nil {
		close(progressCh)
		<-progressDone
	}

	return errCapture.String(), waitErr
}

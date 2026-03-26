package jobs

import (
	"context"
	"os/exec"
	"sync"
	"syscall"

	"s3desk/internal/logging"
)

// runRcloneAttempt executes a single rclone invocation and streams logs to the job log.
// It returns a compact stderr capture (last N lines) and the rclone process wait error.
func (m *Manager) runRcloneAttempt(ctx context.Context, rclonePath string, args []string, jobID string, logWriter *jobLogWriter, opts runRcloneOptions) (stderrCapture string, waitErr error) {
	hooks := currentProcessTestHooks()
	if hooks.runRcloneAttempt != nil {
		return hooks.runRcloneAttempt(
			ctx,
			rclonePath,
			args,
			jobID,
			TestRunRcloneAttemptOptions{
				TrackProgress: opts.TrackProgress,
				DryRun:        opts.DryRun,
			},
			func(level string, message string) {
				m.writeJobLog(logWriter, jobID, level, message)
			},
		)
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}

	// #nosec G204 -- rclonePath and arguments are derived from trusted config and internal inputs.
	cmd := exec.Command(rclonePath, args...)
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
	if cmd.Process != nil {
		pid = cmd.Process.Pid
	}
	cancelWatcher := startProcessCancelWatcher(ctx, jobID, pid)

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

	if cancelErr := cancelWatcher.finish(); cancelErr != nil {
		if pid > 0 {
			logging.WarnFields("job process termination helper failed", map[string]any{
				"event":  "job.process_cancel_failed",
				"job_id": jobID,
				"pid":    pid,
				"error":  cancelErr.Error(),
			})
		}
		if waitErr == nil && ctx.Err() != nil {
			waitErr = cancelErr
		}
	}

	wg.Wait()

	if progressCh != nil {
		close(progressCh)
		<-progressDone
	}

	return errCapture.String(), waitErr
}

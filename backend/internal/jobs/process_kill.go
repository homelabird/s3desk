package jobs

import (
	"context"
	"errors"
	"fmt"
	"syscall"
	"time"

	"s3desk/internal/logging"
)

const (
	processTerminateGracePeriod = 2 * time.Second
	processTerminateKillWait    = 1 * time.Second
	processTerminatePollEvery   = 50 * time.Millisecond
)

type processCancelWatcher struct {
	done   chan struct{}
	result chan error
}

func startProcessCancelWatcher(ctx context.Context, jobID string, pid int) *processCancelWatcher {
	if pid <= 0 {
		return nil
	}

	watcher := &processCancelWatcher{
		done:   make(chan struct{}),
		result: make(chan error, 1),
	}
	go func() {
		select {
		case <-ctx.Done():
			watcher.result <- terminateJobProcess(jobID, pid)
		case <-watcher.done:
			watcher.result <- nil
		}
	}()
	return watcher
}

func (w *processCancelWatcher) finish() error {
	if w == nil {
		return nil
	}
	close(w.done)
	return <-w.result
}

func terminateJobProcess(jobID string, pid int) error {
	_, err := terminateJobProcessWithTimeouts(
		jobID,
		pid,
		processTerminateGracePeriod,
		processTerminateKillWait,
		processTerminatePollEvery,
	)
	return err
}

func terminateJobProcessWithTimeouts(jobID string, pid int, grace time.Duration, killWait time.Duration, pollEvery time.Duration) (usedSigkill bool, err error) {
	if pid <= 0 {
		return false, nil
	}

	pgid, err := syscall.Getpgid(pid)
	switch {
	case err == nil:
	case errors.Is(err, syscall.ESRCH):
		return false, nil
	default:
		return false, err
	}

	if pgid <= 0 {
		return false, nil
	}

	if pgid != pid {
		logging.WarnFields("job process group mismatch", map[string]any{
			"event":  "job.process_cancel_group_mismatch",
			"job_id": jobID,
			"pid":    pid,
			"pgid":   pgid,
		})
		return terminateSingleProcess(jobID, pid, grace, killWait, pollEvery)
	}

	logging.InfoFields("canceling job process group", map[string]any{
		"event":  "job.process_cancel",
		"job_id": jobID,
		"pid":    pid,
		"pgid":   pgid,
		"signal": "SIGTERM",
	})
	if err := signalProcessGroup(pgid, syscall.SIGTERM); err != nil {
		return false, err
	}
	if waitForProcessGroupExit(pgid, grace, pollEvery) {
		return false, nil
	}

	logging.WarnFields("forcing job process group kill", map[string]any{
		"event":  "job.process_force_kill",
		"job_id": jobID,
		"pid":    pid,
		"pgid":   pgid,
		"signal": "SIGKILL",
	})
	if err := signalProcessGroup(pgid, syscall.SIGKILL); err != nil {
		return true, err
	}
	if waitForProcessGroupExit(pgid, killWait, pollEvery) {
		return true, nil
	}

	return true, fmt.Errorf("process group %d did not exit after SIGKILL", pgid)
}

func terminateSingleProcess(jobID string, pid int, grace time.Duration, killWait time.Duration, pollEvery time.Duration) (usedSigkill bool, err error) {
	logging.WarnFields("canceling job process directly", map[string]any{
		"event":  "job.process_cancel_direct",
		"job_id": jobID,
		"pid":    pid,
		"signal": "SIGTERM",
	})
	if err := signalProcess(pid, syscall.SIGTERM); err != nil {
		return false, err
	}
	if waitForProcessExit(pid, grace, pollEvery) {
		return false, nil
	}

	logging.WarnFields("forcing direct job process kill", map[string]any{
		"event":  "job.process_force_kill_direct",
		"job_id": jobID,
		"pid":    pid,
		"signal": "SIGKILL",
	})
	if err := signalProcess(pid, syscall.SIGKILL); err != nil {
		return true, err
	}
	if waitForProcessExit(pid, killWait, pollEvery) {
		return true, nil
	}

	return true, fmt.Errorf("process %d did not exit after SIGKILL", pid)
}

func signalProcessGroup(pgid int, sig syscall.Signal) error {
	if pgid <= 0 {
		return nil
	}
	if err := syscall.Kill(-pgid, sig); err != nil && !errors.Is(err, syscall.ESRCH) {
		return err
	}
	return nil
}

func signalProcess(pid int, sig syscall.Signal) error {
	if pid <= 0 {
		return nil
	}
	if err := syscall.Kill(pid, sig); err != nil && !errors.Is(err, syscall.ESRCH) {
		return err
	}
	return nil
}

func waitForProcessGroupExit(pgid int, timeout time.Duration, pollEvery time.Duration) bool {
	return waitForExit(timeout, pollEvery, func() (bool, error) {
		if pgid <= 0 {
			return true, nil
		}
		err := syscall.Kill(-pgid, 0)
		switch {
		case err == nil:
			return false, nil
		case errors.Is(err, syscall.ESRCH):
			return true, nil
		case errors.Is(err, syscall.EPERM):
			return false, nil
		default:
			return false, err
		}
	})
}

func waitForProcessExit(pid int, timeout time.Duration, pollEvery time.Duration) bool {
	return waitForExit(timeout, pollEvery, func() (bool, error) {
		if pid <= 0 {
			return true, nil
		}
		err := syscall.Kill(pid, 0)
		switch {
		case err == nil:
			return false, nil
		case errors.Is(err, syscall.ESRCH):
			return true, nil
		case errors.Is(err, syscall.EPERM):
			return false, nil
		default:
			return false, err
		}
	})
}

func waitForExit(timeout time.Duration, pollEvery time.Duration, exists func() (bool, error)) bool {
	if pollEvery <= 0 {
		pollEvery = processTerminatePollEvery
	}
	deadline := time.Now().Add(timeout)
	for {
		exited, err := exists()
		if exited {
			return true
		}
		if err != nil {
			return false
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(pollEvery)
	}
}

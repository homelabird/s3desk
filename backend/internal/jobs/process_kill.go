package jobs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"

	"s3desk/internal/logging"
)

const (
	processTerminateGracePeriod = 2 * time.Second
	processTerminateKillWait    = 1 * time.Second
	processTerminatePollEvery   = 50 * time.Millisecond
)

type KillOutcome string

const (
	KillOutcomeNoop        KillOutcome = "noop"
	KillOutcomeGraceful    KillOutcome = "graceful"
	KillOutcomeForceKilled KillOutcome = "force_killed"
	KillOutcomeFailed      KillOutcome = "failed"
)

var (
	errProcessSelfTermination      = errors.New("refusing to terminate current process")
	errProcessSelfGroupTermination = errors.New("refusing to terminate current process group")
)

// KillPolicy defines the graceful and forced process termination windows.
type KillPolicy struct {
	GracePeriod time.Duration
	KillWait    time.Duration
	PollEvery   time.Duration
}

// KillResult records the final process termination outcome for callers and tests.
type KillResult struct {
	Outcome     KillOutcome
	UsedSigkill bool
	Err         error
}

type processCancelWatcher struct {
	done   chan struct{}
	result chan error
}

// ConfigureProcessGroup makes cmd own a process group so cancellation can
// terminate rclone and any children it starts together.
func ConfigureProcessGroup(cmd *exec.Cmd) {
	if cmd != nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}
}

// StartProcessCancelWatcher returns a one-shot cleanup function for a
// process-group-backed command.
func StartProcessCancelWatcher(ctx context.Context, jobID string, pid int) func() error {
	watcher := startProcessCancelWatcher(ctx, jobID, pid)
	return watcher.finish
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
	result := terminateJobProcessWithPolicy(
		jobID,
		pid,
		KillPolicy{},
	)
	return result.Err
}

func terminateJobProcessWithTimeouts(jobID string, pid int, grace time.Duration, killWait time.Duration, pollEvery time.Duration) (usedSigkill bool, err error) {
	result := terminateJobProcessWithPolicy(jobID, pid, KillPolicy{
		GracePeriod: grace,
		KillWait:    killWait,
		PollEvery:   pollEvery,
	})
	return result.UsedSigkill, result.Err
}

func terminateJobProcessWithPolicy(jobID string, pid int, policy KillPolicy) KillResult {
	policy = policy.withDefaults()
	if pid <= 0 {
		return KillResult{Outcome: KillOutcomeNoop}
	}
	if err := CanTerminate(pid); err != nil {
		logProcessTerminationFailed(jobID, pid, 0, err)
		return KillResult{Outcome: KillOutcomeFailed, Err: err}
	}

	pgid, err := syscall.Getpgid(pid)
	switch {
	case err == nil:
	case errors.Is(err, syscall.ESRCH):
		return KillResult{Outcome: KillOutcomeNoop}
	default:
		logProcessTerminationFailed(jobID, pid, 0, err)
		return KillResult{Outcome: KillOutcomeFailed, Err: err}
	}

	if pgid <= 0 {
		return KillResult{Outcome: KillOutcomeNoop}
	}

	if pgid != pid {
		logging.WarnFields("job process group mismatch", map[string]any{
			"event":  "job.process_cancel_group_mismatch",
			"job_id": jobID,
			"pid":    pid,
			"pgid":   pgid,
		})
		usedSigkill, err := terminateSingleProcess(jobID, pid, policy)
		return killResult(usedSigkill, err)
	}

	logging.InfoFields("canceling job process group", map[string]any{
		"event":   "job.process_cancel",
		"job_id":  jobID,
		"pid":     pid,
		"pgid":    pgid,
		"signal":  "SIGTERM",
		"outcome": "requested",
	})
	if err := signalProcessGroup(pgid, syscall.SIGTERM); err != nil {
		logProcessTerminationFailed(jobID, pid, pgid, err)
		return KillResult{Outcome: KillOutcomeFailed, Err: err}
	}
	if waitForProcessGroupExit(pgid, policy.GracePeriod, policy.PollEvery) {
		logProcessTerminated(jobID, pid, pgid, KillOutcomeGraceful)
		return KillResult{Outcome: KillOutcomeGraceful}
	}

	logging.WarnFields("forcing job process group kill", map[string]any{
		"event":   "job.process_force_kill",
		"job_id":  jobID,
		"pid":     pid,
		"pgid":    pgid,
		"signal":  "SIGKILL",
		"outcome": "requested",
	})
	if err := signalProcessGroup(pgid, syscall.SIGKILL); err != nil {
		logProcessTerminationFailed(jobID, pid, pgid, err)
		return KillResult{Outcome: KillOutcomeFailed, UsedSigkill: true, Err: err}
	}
	if waitForProcessGroupExit(pgid, policy.KillWait, policy.PollEvery) {
		logProcessTerminated(jobID, pid, pgid, KillOutcomeForceKilled)
		return KillResult{Outcome: KillOutcomeForceKilled, UsedSigkill: true}
	}

	err = fmt.Errorf("process group %d did not exit after SIGKILL", pgid)
	logProcessTerminationFailed(jobID, pid, pgid, err)
	return KillResult{Outcome: KillOutcomeFailed, UsedSigkill: true, Err: err}
}

func terminateSingleProcess(jobID string, pid int, policy KillPolicy) (usedSigkill bool, err error) {
	logging.WarnFields("canceling job process directly", map[string]any{
		"event":   "job.process_cancel_direct",
		"job_id":  jobID,
		"pid":     pid,
		"signal":  "SIGTERM",
		"outcome": "requested",
	})
	if err := TryTerminate(pid); err != nil {
		return false, err
	}
	if waitForProcessExit(pid, policy.GracePeriod, policy.PollEvery) {
		logProcessTerminated(jobID, pid, 0, KillOutcomeGraceful)
		return false, nil
	}

	logging.WarnFields("forcing direct job process kill", map[string]any{
		"event":   "job.process_force_kill_direct",
		"job_id":  jobID,
		"pid":     pid,
		"signal":  "SIGKILL",
		"outcome": "requested",
	})
	if err := ForceTerminate(pid); err != nil {
		return true, err
	}
	if waitForProcessExit(pid, policy.KillWait, policy.PollEvery) {
		logProcessTerminated(jobID, pid, 0, KillOutcomeForceKilled)
		return true, nil
	}

	return true, fmt.Errorf("process %d did not exit after SIGKILL", pid)
}

// IsSelfPID reports whether pid identifies the current process.
func IsSelfPID(pid int) bool {
	return pid > 0 && pid == os.Getpid()
}

// CanTerminate returns an error when pid must not be terminated by this process.
func CanTerminate(pid int) error {
	if IsSelfPID(pid) {
		return errProcessSelfTermination
	}
	return nil
}

// TryTerminate sends SIGTERM to pid after applying safety guards.
func TryTerminate(pid int) error {
	return signalProcess(pid, syscall.SIGTERM)
}

// ForceTerminate sends SIGKILL to pid after applying safety guards.
func ForceTerminate(pid int) error {
	return signalProcess(pid, syscall.SIGKILL)
}

func signalProcessGroup(pgid int, sig syscall.Signal) error {
	if pgid <= 0 {
		return nil
	}
	if isCurrentProcessGroup(pgid) {
		return errProcessSelfGroupTermination
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
	if err := CanTerminate(pid); err != nil {
		return err
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

func (policy KillPolicy) withDefaults() KillPolicy {
	if policy.GracePeriod <= 0 {
		policy.GracePeriod = processTerminateGracePeriod
	}
	if policy.KillWait <= 0 {
		policy.KillWait = processTerminateKillWait
	}
	if policy.PollEvery <= 0 {
		policy.PollEvery = processTerminatePollEvery
	}
	return policy
}

func killResult(usedSigkill bool, err error) KillResult {
	if err != nil {
		return KillResult{Outcome: KillOutcomeFailed, UsedSigkill: usedSigkill, Err: err}
	}
	if usedSigkill {
		return KillResult{Outcome: KillOutcomeForceKilled, UsedSigkill: true}
	}
	return KillResult{Outcome: KillOutcomeGraceful}
}

func isCurrentProcessGroup(pgid int) bool {
	if pgid <= 0 {
		return false
	}
	currentPGID, err := syscall.Getpgid(os.Getpid())
	return err == nil && currentPGID == pgid
}

func logProcessTerminated(jobID string, pid int, pgid int, outcome KillOutcome) {
	fields := map[string]any{
		"event":   "job.process_terminated",
		"job_id":  jobID,
		"pid":     pid,
		"outcome": string(outcome),
	}
	if pgid > 0 {
		fields["pgid"] = pgid
	}
	logging.InfoFields("job process terminated", fields)
}

func logProcessTerminationFailed(jobID string, pid int, pgid int, err error) {
	fields := map[string]any{
		"event":   "job.process_termination_failed",
		"job_id":  jobID,
		"pid":     pid,
		"outcome": string(KillOutcomeFailed),
		"error":   err.Error(),
	}
	if pgid > 0 {
		fields["pgid"] = pgid
	}
	logging.WarnFields("job process termination failed", fields)
}

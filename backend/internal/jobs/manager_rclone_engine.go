package jobs

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"s3desk/internal/rcloneconfig"
	"s3desk/internal/rcloneerrors"
)

func (m *Manager) runRclone(ctx context.Context, profileID, jobID string, commandArgs []string, opts runRcloneOptions) error {
	rclonePath, _, err := EnsureRcloneCompatible(ctx)
	if err != nil {
		return TransferEngineJobError(err)
	}

	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrProfileNotFound
	}

	configPath, err := m.writeRcloneConfig(jobID, profileSecrets)
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(configPath) }()

	tlsArgs, tlsCleanup, err := PrepareRcloneTLSFlags(profileSecrets)
	if err != nil {
		return err
	}
	defer tlsCleanup()

	statsInterval := m.rcloneStatsInterval
	if !opts.TrackProgress {
		statsInterval = 0
	}

	args := []string{
		"--config", configPath,
		"--stats", statsInterval.String(),
		"--stats-log-level", "NOTICE",
		"--use-json-log",
	}
	if len(tlsArgs) > 0 {
		args = append(args, tlsArgs...)
	}
	if opts.DryRun {
		args = append(args, "--dry-run")
	}
	isS3 := rcloneconfig.IsS3LikeProvider(profileSecrets.Provider)
	if isS3 && m.rcloneS3ChunkSizeMiB > 0 && !hasAnyFlag(args, "--s3-chunk-size") {
		args = append(args, "--s3-chunk-size", fmt.Sprintf("%dM", m.rcloneS3ChunkSizeMiB))
	}
	if m.rcloneLowLevelRetries > 0 && !hasAnyFlag(args, "--low-level-retries") {
		args = append(args, "--low-level-retries", strconv.Itoa(m.rcloneLowLevelRetries))
	}

	tune, tuneOK := m.computeRcloneTune(commandArgs, isS3)
	if tuneOK {
		args = applyRcloneTune(args, tune, isS3)
	}
	args = append(args, commandArgs...)

	logPath := filepath.Join(m.dataDir, "logs", "jobs", jobID+".log")
	logWriter, err := openJobLogWriter(logPath, m.logMaxBytes)
	if err != nil {
		return err
	}
	defer func() { _ = logWriter.Close() }()

	if tuneOK {
		tuneMsg := fmt.Sprintf("rclone tune: activeJobs=%d transfers=%d checkers=%d uploadConcurrency=%d", tune.ActiveJobs, tune.Transfers, tune.Checkers, tune.UploadConcurrency)
		_, _ = logWriter.Write([]byte("[info] " + tuneMsg + "\n"))
		m.emitJobLogStdout(jobID, "info", tuneMsg)
	}

	maxAttempts := m.rcloneRetryAttempts
	if maxAttempts < 1 {
		maxAttempts = 1
	}

	errContext := "rclone"
	if len(commandArgs) > 0 {
		errContext = errContext + " " + commandArgs[0]
	}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if attempt > 1 {
			m.writeJobLog(logWriter, jobID, "warn", fmt.Sprintf("retrying %s (attempt %d/%d)", errContext, attempt, maxAttempts))
		}

		stderrCapture, waitErr := m.runRcloneAttempt(ctx, rclonePath, args, jobID, logWriter, opts)
		if waitErr == nil {
			return nil
		}

		cls := rcloneerrors.Classify(waitErr, stderrCapture)
		if cls.Code == rcloneerrors.CodeUnknown {
			m.maybeCaptureUnknownRcloneError(profileSecrets, jobID, errContext, stderrCapture)
		}

		if attempt >= maxAttempts || !cls.Retryable {
			return jobErrorFromRclone(waitErr, stderrCapture, errContext)
		}

		if m.metrics != nil {
			if jt, ok := jobTypeFromContext(ctx); ok {
				m.metrics.IncJobsRetried(jt)
			}
		}

		delay := m.rcloneRetryDelay(attempt, cls.Code)
		m.writeJobLog(logWriter, jobID, "warn", fmt.Sprintf("%s failed with %s; retrying in %s (attempt %d/%d)", errContext, cls.Code, delay, attempt+1, maxAttempts))
		if err := sleepWithContext(ctx, delay); err != nil {
			return err
		}
	}
	return nil
}

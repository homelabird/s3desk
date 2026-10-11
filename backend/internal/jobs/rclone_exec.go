package jobs

import (
	"context"
	"io"
	"os"
	"os/exec"

	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/processio"
	"s3desk/internal/profileendpoint"
	"s3desk/internal/rcloneegress"
)

type rcloneProcess struct {
	stdout io.ReadCloser
	stderr rcloneProcessStderr
	wait   func() error
}

type rcloneProcessStderr interface {
	String() string
}

var (
	rcloneCaptureStdoutMaxBytes = processio.DefaultStdoutMaxBytes
	rcloneStderrMaxBytes        = processio.DefaultStderrMaxBytes
)

func (m *Manager) startRcloneCommand(ctx context.Context, profile models.ProfileSecrets, jobID string, args []string) (*rcloneProcess, error) {
	if err := profileendpoint.ValidateProfileSecretsEndpointsContext(ctx, profile, m.allowRemote); err != nil {
		return nil, err
	}
	hooks := currentProcessTestHooks()
	if hooks.startRcloneCommand != nil {
		return hooks.startRcloneCommand(ctx, profile, jobID, args)
	}
	rclonePath, _, err := EnsureRcloneCompatible(ctx)
	if err != nil {
		return nil, TransferEngineJobError(err)
	}

	configPath, err := m.writeRcloneConfig(ctx, jobID, profile)
	if err != nil {
		return nil, err
	}

	tlsArgs, tlsCleanup, err := PrepareRcloneTLSFlags(profile)
	if err != nil {
		_ = os.Remove(configPath)
		return nil, err
	}

	fullArgs := []string{"--config", configPath}
	fullArgs = append(fullArgs, tlsArgs...)
	fullArgs = append(fullArgs, args...)

	if err := ctx.Err(); err != nil {
		_ = os.Remove(configPath)
		tlsCleanup()
		return nil, err
	}
	egressProxy, err := rcloneegress.Start(ctx, m.allowRemote)
	if err != nil {
		_ = os.Remove(configPath)
		tlsCleanup()
		return nil, err
	}

	// #nosec G204 -- rclonePath and arguments are derived from trusted config and internal inputs.
	cmd := exec.Command(rclonePath, fullArgs...)
	ConfigureProcessGroup(cmd)
	cmd.Env = egressProxy.Environment(os.Environ())
	stdout, stdoutWriter := io.Pipe()
	cmd.Stdout = stdoutWriter
	stderrBuf := processio.NewLimitBuffer(rcloneStderrMaxBytes)
	cmd.Stderr = stderrBuf
	cmd.WaitDelay = rclonePipeDrainTimeout

	if err := cmd.Start(); err != nil {
		_ = stdout.Close()
		_ = stdoutWriter.Close()
		_ = egressProxy.Close()
		_ = os.Remove(configPath)
		tlsCleanup()
		return nil, err
	}
	pid := 0
	if cmd.Process != nil {
		pid = cmd.Process.Pid
	}
	cancelWatcher := StartProcessCancelWatcher(ctx, jobID, pid)

	waitDone := make(chan error, 1)
	go func() {
		err := cmd.Wait()
		_ = stdoutWriter.Close()
		waitDone <- err
	}()

	wait := func() error {
		// Callers can stop at enough metadata; drain the remainder for process exit.
		_, _ = io.Copy(io.Discard, stdout)
		_ = stdout.Close()
		err := <-waitDone
		if cancelErr := cancelWatcher(); cancelErr != nil {
			if pid > 0 {
				logging.WarnFields("job process termination helper failed", map[string]any{
					"event":  "job.process_cancel_failed",
					"job_id": jobID,
					"pid":    pid,
					"error":  cancelErr.Error(),
				})
			}
			if err == nil && ctx.Err() != nil {
				err = cancelErr
			}
		}
		_ = egressProxy.Close()
		_ = os.Remove(configPath)
		tlsCleanup()
		return err
	}

	return &rcloneProcess{
		stdout: stdout,
		stderr: stderrBuf,
		wait:   wait,
	}, nil
}

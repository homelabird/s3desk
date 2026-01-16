package jobs

import (
	"bytes"
	"context"
	"io"
	"os"
	"os/exec"

	"s3desk/internal/models"
)

type rcloneProcess struct {
	stdout io.ReadCloser
	stderr *bytes.Buffer
	wait   func() error
}

func (m *Manager) startRcloneCommand(ctx context.Context, profile models.ProfileSecrets, jobID string, args []string) (*rcloneProcess, error) {
	rclonePath, _, err := EnsureRcloneCompatible(ctx)
	if err != nil {
		return nil, TransferEngineJobError(err)
	}

	configPath, err := m.writeRcloneConfig(jobID, profile)
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

	// #nosec G204 -- rclonePath and arguments are derived from trusted config and internal inputs.
	cmd := exec.CommandContext(ctx, rclonePath, fullArgs...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = os.Remove(configPath)
		tlsCleanup()
		return nil, err
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		_ = os.Remove(configPath)
		tlsCleanup()
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		_ = os.Remove(configPath)
		tlsCleanup()
		return nil, err
	}

	var stderrBuf bytes.Buffer
	stderrDone := make(chan struct{})
	go func() {
		_, _ = io.Copy(&stderrBuf, stderrPipe)
		close(stderrDone)
	}()

	wait := func() error {
		err := cmd.Wait()
		<-stderrDone
		_ = os.Remove(configPath)
		tlsCleanup()
		return err
	}

	return &rcloneProcess{
		stdout: stdout,
		stderr: &stderrBuf,
		wait:   wait,
	}, nil
}

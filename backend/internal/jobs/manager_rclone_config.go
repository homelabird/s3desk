package jobs

import (
	"os"
	"path/filepath"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
)

func (m *Manager) writeRcloneConfig(jobID string, profile models.ProfileSecrets) (string, error) {
	dir := filepath.Join(m.dataDir, "logs", "jobs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	path := filepath.Join(dir, jobID+".rclone.conf")
	if err := rcloneconfig.WriteConfigFile(path, profile, rcloneconfig.RemoteName); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

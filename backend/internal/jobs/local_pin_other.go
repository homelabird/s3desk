//go:build !(linux || darwin || freebsd || netbsd || openbsd || dragonfly || solaris)

package jobs

import "os"

type pinnedLocalRcloneDir struct{}

func (m *Manager) pinLocalRcloneDir(path string) (*pinnedLocalRcloneDir, error) {
	return nil, nil
}

func (m *Manager) pinUploadStagingRcloneDir(path string) (*pinnedLocalRcloneDir, error) {
	return nil, nil
}

func (p *pinnedLocalRcloneDir) Close() error {
	return nil
}

func (p *pinnedLocalRcloneDir) extraFile() *os.File {
	return nil
}

func (p *pinnedLocalRcloneDir) rclonePath(extraFileIndex int) string {
	return ""
}

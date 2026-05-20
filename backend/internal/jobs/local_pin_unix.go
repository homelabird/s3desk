//go:build linux || darwin || freebsd || netbsd || openbsd || dragonfly || solaris

package jobs

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"s3desk/internal/localpath"
	"s3desk/internal/store"
)

type pinnedLocalRcloneDir struct {
	file *os.File
}

func (m *Manager) pinLocalRcloneDir(path string) (*pinnedLocalRcloneDir, error) {
	file, err := localpath.OpenPinnedDirUnderRoots(path, m.allowedLocalDirs)
	if err != nil {
		return nil, fmt.Errorf("pin localPath %q: %w", path, err)
	}
	return &pinnedLocalRcloneDir{file: file}, nil
}

func (m *Manager) pinUploadStagingRcloneDir(path string) (*pinnedLocalRcloneDir, error) {
	stagingRoot := store.UploadStagingRoot(m.dataDir)
	file, err := localpath.OpenPinnedDirUnderRoots(path, []string{stagingRoot})
	if err != nil {
		return nil, fmt.Errorf("pin upload staging dir %q: %w", path, err)
	}
	return &pinnedLocalRcloneDir{file: file}, nil
}

func (p *pinnedLocalRcloneDir) Close() error {
	if p == nil || p.file == nil {
		return nil
	}
	err := p.file.Close()
	p.file = nil
	return err
}

func (p *pinnedLocalRcloneDir) extraFile() *os.File {
	if p == nil {
		return nil
	}
	return p.file
}

func (p *pinnedLocalRcloneDir) rclonePath(extraFileIndex int) string {
	base := "/dev/fd"
	if runtime.GOOS == "linux" {
		base = "/proc/self/fd"
	}
	return filepath.Join(base, fmt.Sprintf("%d", 3+extraFileIndex)) + string(os.PathSeparator)
}

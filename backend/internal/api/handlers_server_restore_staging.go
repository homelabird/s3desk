package api

import (
	"os"
	"path/filepath"
)

type serverRestoreStagingDir struct {
	tempRoot      string
	finalRoot     string
	cleanupOnExit bool
}

func newManagedServerRestoreStagingDir(baseRoot, finalName string) (*serverRestoreStagingDir, error) {
	tempRoot := filepath.Join(baseRoot, "."+finalName+".tmp")
	finalRoot := filepath.Join(baseRoot, finalName)
	if err := os.MkdirAll(tempRoot, 0o700); err != nil {
		return nil, err
	}
	return &serverRestoreStagingDir{
		tempRoot:      tempRoot,
		finalRoot:     finalRoot,
		cleanupOnExit: true,
	}, nil
}

func newTempServerRestoreStagingDir(pattern string) (*serverRestoreStagingDir, error) {
	tempRoot, err := os.MkdirTemp("", pattern)
	if err != nil {
		return nil, err
	}
	return &serverRestoreStagingDir{
		tempRoot:      tempRoot,
		cleanupOnExit: true,
	}, nil
}

func (d *serverRestoreStagingDir) TempRoot() string {
	if d == nil {
		return ""
	}
	return d.tempRoot
}

func (d *serverRestoreStagingDir) FinalRoot() string {
	if d == nil {
		return ""
	}
	return d.finalRoot
}

func (d *serverRestoreStagingDir) Cleanup() {
	if d == nil || !d.cleanupOnExit || d.tempRoot == "" {
		return
	}
	_ = os.RemoveAll(d.tempRoot)
}

func (d *serverRestoreStagingDir) Commit() error {
	if d == nil || d.tempRoot == "" {
		return nil
	}
	if d.finalRoot == "" {
		d.cleanupOnExit = false
		return nil
	}
	if err := os.Rename(d.tempRoot, d.finalRoot); err != nil {
		return err
	}
	d.cleanupOnExit = false
	return nil
}

func (d *serverRestoreStagingDir) ReleaseTempRoot() string {
	if d == nil {
		return ""
	}
	d.cleanupOnExit = false
	return d.tempRoot
}

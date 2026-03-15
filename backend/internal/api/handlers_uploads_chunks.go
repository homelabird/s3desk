package api

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

var errUploadTooLarge = errors.New("upload too large")

type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

func writePartToFile(part *multipart.Part, dstPath string, maxBytes int64) (int64, error) {
	defer func() { _ = part.Close() }()

	tmpPath := dstPath + ".tmp"
	// #nosec G304 -- tmpPath is derived from the upload staging directory.
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	var r io.Reader = part
	if maxBytes >= 0 {
		r = io.LimitReader(part, maxBytes+1)
	}
	n, copyErr := copyWithTransferBuffer(f, r)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return n, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return n, closeErr
	}
	if maxBytes >= 0 && n > maxBytes {
		_ = os.Remove(tmpPath)
		return n, errUploadTooLarge
	}
	if err := os.Rename(tmpPath, dstPath); err != nil {
		_ = os.Remove(tmpPath)
		return n, err
	}
	return n, nil
}

func writeReaderToFile(r io.Reader, dstPath string, maxBytes int64) (int64, error) {
	tmpPath := dstPath + ".tmp"
	// #nosec G304 -- tmpPath is derived from the upload staging directory.
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	var reader io.Reader = r
	if maxBytes >= 0 {
		reader = io.LimitReader(r, maxBytes+1)
	}
	n, copyErr := copyWithTransferBuffer(f, reader)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return n, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return n, closeErr
	}
	if maxBytes >= 0 && n > maxBytes {
		_ = os.Remove(tmpPath)
		return n, errUploadTooLarge
	}
	if err := os.Rename(tmpPath, dstPath); err != nil {
		_ = os.Remove(tmpPath)
		return n, err
	}
	return n, nil
}

func chunkPartName(index int) string {
	return fmt.Sprintf("part-%06d", index)
}

func tryAssembleChunkFile(stagingDir, relOS, chunkDir string, totalChunks int, onDelta func(int64) error) error {
	if totalChunks <= 0 {
		return nil
	}
	for i := 0; i < totalChunks; i++ {
		if _, err := os.Stat(filepath.Join(chunkDir, chunkPartName(i))); err != nil {
			return nil
		}
	}

	lockPath := filepath.Join(chunkDir, ".assemble.lock")
	// #nosec G304 -- lockPath is derived from the server-managed chunk directory.
	lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil
	}
	_ = lock.Close()
	defer func() { _ = os.Remove(lockPath) }()

	finalPath := filepath.Join(stagingDir, relOS)
	dstDir := filepath.Dir(finalPath)
	if !isUnderDir(stagingDir, dstDir) {
		return fmt.Errorf("invalid upload path")
	}
	if err := os.MkdirAll(dstDir, 0o700); err != nil {
		return err
	}

	tmpPath := finalPath + ".tmp"
	// #nosec G304 -- tmpPath is derived from the upload staging directory.
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}

	var appliedDelta int64
	rollbackDelta := func() {
		if onDelta == nil || appliedDelta == 0 {
			return
		}
		_ = onDelta(-appliedDelta)
	}
	applyDelta := func(delta int64) error {
		if onDelta == nil || delta == 0 {
			return nil
		}
		if err := onDelta(delta); err != nil {
			return err
		}
		appliedDelta += delta
		return nil
	}

	for i := 0; i < totalChunks; i++ {
		partPath := filepath.Join(chunkDir, chunkPartName(i))
		info, err := os.Stat(partPath)
		if err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			rollbackDelta()
			return err
		}
		partSize := info.Size()

		// #nosec G304 -- partPath is derived from the server-managed chunk directory and chunk index.
		part, err := os.Open(partPath)
		if err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			rollbackDelta()
			return err
		}

		copied, err := copyWithTransferBuffer(f, part)
		if copied > 0 {
			if deltaErr := applyDelta(copied); deltaErr != nil {
				_ = part.Close()
				_ = f.Close()
				_ = os.Remove(tmpPath)
				rollbackDelta()
				return fmt.Errorf("apply upload byte delta: %w", deltaErr)
			}
		}
		if err != nil {
			_ = part.Close()
			_ = f.Close()
			_ = os.Remove(tmpPath)
			rollbackDelta()
			return err
		}
		_ = part.Close()

		if err := os.Remove(partPath); err == nil {
			if deltaErr := applyDelta(-partSize); deltaErr != nil {
				_ = f.Close()
				_ = os.Remove(tmpPath)
				rollbackDelta()
				return fmt.Errorf("apply upload byte delta: %w", deltaErr)
			}
		}
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		rollbackDelta()
		return err
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		rollbackDelta()
		return err
	}
	_ = os.RemoveAll(chunkDir)
	return nil
}

func isUnderDir(dir, target string) bool {
	rel, err := filepath.Rel(dir, target)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return false
	}
	return true
}

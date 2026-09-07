package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
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

func writeReaderToTempFile(r io.Reader, dstPath string, maxBytes int64) (string, int64, error) {
	tmpFile, err := os.CreateTemp(filepath.Dir(dstPath), filepath.Base(dstPath)+".*.tmp")
	if err != nil {
		return "", 0, err
	}
	tmpPath := tmpFile.Name()
	f := tmpFile
	var reader io.Reader = r
	if maxBytes >= 0 {
		reader = io.LimitReader(r, maxBytes+1)
	}
	n, copyErr := copyWithTransferBuffer(f, reader)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return tmpPath, n, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return tmpPath, n, closeErr
	}
	if maxBytes >= 0 && n > maxBytes {
		_ = os.Remove(tmpPath)
		return tmpPath, n, errUploadTooLarge
	}
	return tmpPath, n, nil
}

func chunkPartName(index int) string {
	return fmt.Sprintf("part-%06d", index)
}

// DATA_DIR has one server owner. Claims protect promotion and assembly, not body reception.
var stagingPathLocks sync.Map

func lockStagingPath(ctx context.Context, path string) (func(), error) {
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		done := make(chan struct{})
		active, busy := stagingPathLocks.LoadOrStore(path, done)
		if !busy {
			return func() {
				stagingPathLocks.Delete(path)
				close(done)
			}, nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-active.(chan struct{}):
		}
	}
}

func tryAssembleChunkFile(ctx context.Context, stagingDir, relOS, chunkDir string, totalChunks int) error {
	release, err := lockStagingPath(ctx, chunkDir)
	if err != nil {
		return err
	}
	defer release()
	return assembleChunkFile(ctx, stagingDir, relOS, chunkDir, totalChunks)
}

// The caller holds the file's staging chunk lock through validation and assembly.
func assembleChunkFile(ctx context.Context, stagingDir, relOS, chunkDir string, totalChunks int) error {
	if totalChunks <= 0 {
		return nil
	}
	for i := 0; i < totalChunks; i++ {
		if _, err := os.Stat(filepath.Join(chunkDir, chunkPartName(i))); err != nil {
			return nil
		}
	}

	finalPath := filepath.Join(stagingDir, relOS)
	dstDir := filepath.Dir(finalPath)
	if !isUnderDir(stagingDir, dstDir) {
		return fmt.Errorf("invalid upload path")
	}
	if err := os.MkdirAll(dstDir, 0o700); err != nil {
		return err
	}

	// A retry removes interrupted assembly files together with the completed chunks.
	tmpFile, err := os.CreateTemp(chunkDir, filepath.Base(finalPath)+".*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmpFile.Name()
	f := tmpFile

	for i := 0; i < totalChunks; i++ {
		partPath := filepath.Join(chunkDir, chunkPartName(i))
		if err := ctx.Err(); err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return err
		}
		if _, err := os.Stat(partPath); err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return err
		}

		// #nosec G304 -- partPath is derived from the server-managed chunk directory and chunk index.
		part, err := os.Open(partPath)
		if err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return err
		}

		_, err = copyWithTransferBuffer(f, part)
		if err != nil {
			_ = part.Close()
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return err
		}
		_ = part.Close()
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.RemoveAll(chunkDir); err != nil {
		return fmt.Errorf("cleanup assembled chunks: %w", err)
	}
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

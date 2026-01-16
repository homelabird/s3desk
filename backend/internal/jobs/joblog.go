package jobs

import (
	"errors"
	"io"
	"os"
	"sync"
)

const jobLogTruncateMarginBytes = 256 * 1024

type jobLogWriter struct {
	mu       sync.Mutex
	f        *os.File
	maxBytes int64
}

func openJobLogWriter(path string, maxBytes int64) (*jobLogWriter, error) {
	// #nosec G304 -- path is built from the configured data directory.
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}
	return &jobLogWriter{f: f, maxBytes: maxBytes}, nil
}

func (w *jobLogWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.f == nil {
		return nil
	}
	err := w.f.Close()
	w.f = nil
	return err
}

func (w *jobLogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.f == nil {
		return 0, errors.New("job log writer is closed")
	}

	n, err := w.f.Write(p)
	if err != nil {
		return n, err
	}
	if w.maxBytes > 0 {
		_ = w.truncateIfNeededLocked()
	}
	return n, nil
}

func (w *jobLogWriter) truncateIfNeededLocked() error {
	info, err := w.f.Stat()
	if err != nil {
		return err
	}
	size := info.Size()
	if size <= w.maxBytes+jobLogTruncateMarginBytes {
		return nil
	}

	start := size - w.maxBytes
	if start < 0 {
		start = 0
	}
	if _, err := w.f.Seek(start, io.SeekStart); err != nil {
		return err
	}
	tail, err := io.ReadAll(io.LimitReader(w.f, w.maxBytes))
	if err != nil {
		return err
	}

	if err := w.f.Truncate(0); err != nil {
		return err
	}
	if _, err := w.f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	_, err = w.f.Write(tail)
	return err
}

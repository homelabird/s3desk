package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"
)

func (s *server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("ok\n"))
}

func (s *server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("store_unavailable\n"))
		return
	}
	if s.jobs == nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("jobs_unavailable\n"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("db_error\n"))
		return
	}
	if !readyzDataDirWritable(s.cfg.DataDir) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("data_dir_unavailable\n"))
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("ok\n"))
}

func (s *server) handleWorkerz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if s.jobs == nil || !s.jobs.Running() {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("worker_unavailable\n"))
		return
	}

	stats := s.jobs.QueueStats()
	_, _ = fmt.Fprintf(w, "ok\nqueue_depth=%d\nqueue_capacity=%d\n", stats.Depth, stats.Capacity)
}

func readyzDataDirWritable(dataDir string) bool {
	if dataDir == "" {
		return false
	}
	file, err := os.CreateTemp(dataDir, ".s3desk-readyz-*")
	if err != nil {
		return false
	}
	path := file.Name()
	if _, err := file.Write([]byte{0}); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return false
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return false
	}
	return os.Remove(path) == nil
}

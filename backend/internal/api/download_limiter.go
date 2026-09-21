package api

import (
	"net/http"
	"sync"
	"time"

	"s3desk/internal/streamlimit"
)

func (s *server) acquireDownloadSlot(w http.ResponseWriter, r *http.Request, profile string) (func(), bool) {
	if r.Method == http.MethodHead {
		return func() {}, true
	}
	s.downloadLimitOnce.Do(func() {
		s.downloadLimit = streamlimit.New(s.cfg.DownloadMaxConcurrentRequests, s.cfg.DownloadMaxConcurrentPerProfile)
	})
	release, ok := s.downloadLimit.Acquire(profile)
	if !ok {
		s.metrics.ObserveDownloadAdmission(false)
		w.Header().Set("Retry-After", "2")
		writeError(w, http.StatusTooManyRequests, "download_busy", "too many active downloads; retry from Transfers", nil)
		return nil, false
	}
	s.metrics.ObserveDownloadAdmission(true)
	started := time.Now()
	var once sync.Once
	return func() { once.Do(func() { release(); s.metrics.FinishDownloadStream(time.Since(started)) }) }, true
}

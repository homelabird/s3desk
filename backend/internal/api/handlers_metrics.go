package api

import "net/http"

func (s *server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if s.metrics == nil {
		http.NotFound(w, r)
		return
	}
	s.metrics.Handler().ServeHTTP(w, r)
}

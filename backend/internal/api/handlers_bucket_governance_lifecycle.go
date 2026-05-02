package api

import "net/http"

func (s *server) handleGetBucketLifecycle(w http.ResponseWriter, r *http.Request) {
	newBucketLifecycleHTTPService(s).handleGetBucketLifecycle(w, r)
}

func (s *server) handlePutBucketLifecycle(w http.ResponseWriter, r *http.Request) {
	newBucketLifecycleHTTPService(s).handlePutBucketLifecycle(w, r)
}

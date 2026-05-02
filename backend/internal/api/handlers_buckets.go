package api

import "net/http"

func (s *server) handleListBuckets(w http.ResponseWriter, r *http.Request) {
	newBucketHTTPService(s).handleListBuckets(w, r)
}

func (s *server) handleCreateBucket(w http.ResponseWriter, r *http.Request) {
	newBucketHTTPService(s).handleCreateBucket(w, r)
}

func (s *server) handleDeleteBucket(w http.ResponseWriter, r *http.Request) {
	newBucketHTTPService(s).handleDeleteBucket(w, r)
}

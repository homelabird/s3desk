package api

import "net/http"

func (s *server) handleGetBucketAccess(w http.ResponseWriter, r *http.Request) {
	newBucketAccessHTTPService(s).handleGetBucketAccess(w, r)
}

func (s *server) handlePutBucketAccess(w http.ResponseWriter, r *http.Request) {
	newBucketAccessHTTPService(s).handlePutBucketAccess(w, r)
}

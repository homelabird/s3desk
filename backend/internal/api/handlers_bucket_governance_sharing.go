package api

import "net/http"

func (s *server) handleGetBucketSharing(w http.ResponseWriter, r *http.Request) {
	newBucketSharingHTTPService(s).handleGetBucketSharing(w, r)
}

func (s *server) handlePutBucketSharing(w http.ResponseWriter, r *http.Request) {
	newBucketSharingHTTPService(s).handlePutBucketSharing(w, r)
}

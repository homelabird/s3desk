package api

import "net/http"

func (s *server) handleGetBucketProtection(w http.ResponseWriter, r *http.Request) {
	newBucketProtectionHTTPService(s).handleGetBucketProtection(w, r)
}

func (s *server) handlePutBucketProtection(w http.ResponseWriter, r *http.Request) {
	newBucketProtectionHTTPService(s).handlePutBucketProtection(w, r)
}

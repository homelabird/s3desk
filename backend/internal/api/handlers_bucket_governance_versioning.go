package api

import "net/http"

func (s *server) handleGetBucketVersioning(w http.ResponseWriter, r *http.Request) {
	newBucketVersioningHTTPService(s).handleGetBucketVersioning(w, r)
}

func (s *server) handlePutBucketVersioning(w http.ResponseWriter, r *http.Request) {
	newBucketVersioningHTTPService(s).handlePutBucketVersioning(w, r)
}

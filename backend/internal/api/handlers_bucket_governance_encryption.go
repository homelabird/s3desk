package api

import "net/http"

func (s *server) handleGetBucketEncryption(w http.ResponseWriter, r *http.Request) {
	newBucketEncryptionHTTPService(s).handleGetBucketEncryption(w, r)
}

func (s *server) handlePutBucketEncryption(w http.ResponseWriter, r *http.Request) {
	newBucketEncryptionHTTPService(s).handlePutBucketEncryption(w, r)
}

package api

import "net/http"

func (s *server) handleGetBucketGovernance(w http.ResponseWriter, r *http.Request) {
	newBucketGovernanceSummaryHTTPService(s).handleGetBucketGovernance(w, r)
}

package api

import (
	"net/http"
)

func (s *server) handleGetBucketGovernance(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}

	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	view, err := s.bucketGov.GetGovernance(r.Context(), secrets, bucket)
	if err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "governance",
			UnsupportedCode:    "bucket_governance_unsupported",
			UnsupportedMessage: "bucket governance is not supported for this provider",
		})
		return
	}

	writeJSON(w, http.StatusOK, view)
}

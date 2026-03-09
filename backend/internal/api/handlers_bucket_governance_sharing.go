package api

import (
	"net/http"

	"s3desk/internal/models"
)

func (s *server) handleGetBucketSharing(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	view, err := s.bucketGov.GetSharing(r.Context(), secrets, bucket)
	if err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "sharing",
			UnsupportedCode:    "bucket_sharing_unsupported",
			UnsupportedMessage: "bucket sharing controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityPAR,
		})
		return
	}

	writeJSON(w, http.StatusOK, view)
}

func (s *server) handlePutBucketSharing(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	var req models.BucketSharingPutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	view, err := s.bucketGov.PutSharing(r.Context(), secrets, bucket, req)
	if err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "sharing",
			UnsupportedCode:    "bucket_sharing_unsupported",
			UnsupportedMessage: "bucket sharing controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityPAR,
		})
		return
	}

	writeJSON(w, http.StatusOK, view)
}

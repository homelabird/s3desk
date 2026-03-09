package api

import (
	"net/http"

	"s3desk/internal/models"
)

func (s *server) handleGetBucketLifecycle(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	view, err := s.bucketGov.GetLifecycle(r.Context(), secrets, bucket)
	if err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "lifecycle",
			UnsupportedCode:    "bucket_lifecycle_unsupported",
			UnsupportedMessage: "bucket lifecycle controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityLifecycle,
		})
		return
	}

	writeJSON(w, http.StatusOK, view)
}

func (s *server) handlePutBucketLifecycle(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	var req models.BucketLifecyclePutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	if err := s.bucketGov.PutLifecycle(r.Context(), secrets, bucket, req); err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "lifecycle",
			UnsupportedCode:    "bucket_lifecycle_unsupported",
			UnsupportedMessage: "bucket lifecycle controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityLifecycle,
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

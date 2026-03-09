package api

import (
	"net/http"

	"s3desk/internal/models"
)

func (s *server) handleGetBucketVersioning(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	view, err := s.bucketGov.GetVersioning(r.Context(), secrets, bucket)
	if err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "versioning",
			UnsupportedCode:    "bucket_versioning_unsupported",
			UnsupportedMessage: "bucket versioning controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityVersioning,
		})
		return
	}

	writeJSON(w, http.StatusOK, view)
}

func (s *server) handlePutBucketVersioning(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	var req models.BucketVersioningPutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	if err := s.bucketGov.PutVersioning(r.Context(), secrets, bucket, req); err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "versioning",
			UnsupportedCode:    "bucket_versioning_unsupported",
			UnsupportedMessage: "bucket versioning controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityVersioning,
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

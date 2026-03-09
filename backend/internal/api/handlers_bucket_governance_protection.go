package api

import (
	"net/http"

	"s3desk/internal/models"
)

func (s *server) handleGetBucketProtection(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	view, err := s.bucketGov.GetProtection(r.Context(), secrets, bucket)
	if err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "protection",
			UnsupportedCode:    "bucket_protection_unsupported",
			UnsupportedMessage: "bucket protection controls are not supported for this provider",
		})
		return
	}

	writeJSON(w, http.StatusOK, view)
}

func (s *server) handlePutBucketProtection(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	var req models.BucketProtectionPutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	if err := s.bucketGov.PutProtection(r.Context(), secrets, bucket, req); err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "protection",
			UnsupportedCode:    "bucket_protection_unsupported",
			UnsupportedMessage: "bucket protection controls are not supported for this provider",
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

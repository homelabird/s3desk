package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/bucketgov"
	"s3desk/internal/models"
)

type bucketGovernanceSectionSpec struct {
	Section            string
	UnsupportedCode    string
	UnsupportedMessage string
	Capability         models.BucketGovernanceCapability
}

func (s *server) handleGetBucketPublicExposure(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	view, err := s.bucketGov.GetPublicExposure(r.Context(), secrets, bucket)
	if err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "public-exposure",
			UnsupportedCode:    "bucket_public_exposure_unsupported",
			UnsupportedMessage: "bucket public exposure is not supported for this provider",
		})
		return
	}

	writeJSON(w, http.StatusOK, view)
}

func (s *server) handlePutBucketPublicExposure(w http.ResponseWriter, r *http.Request) {
	secrets, bucket, ok := governanceRequestContext(w, r)
	if !ok {
		return
	}
	if s.bucketGov == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
		return
	}

	var req models.BucketPublicExposurePutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	if err := s.bucketGov.PutPublicExposure(r.Context(), secrets, bucket, req); err != nil {
		writeBucketGovernanceSectionError(w, err, secrets.Provider, bucket, bucketGovernanceSectionSpec{
			Section:            "public-exposure",
			UnsupportedCode:    "bucket_public_exposure_unsupported",
			UnsupportedMessage: "bucket public exposure is not supported for this provider",
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func governanceRequestContext(w http.ResponseWriter, r *http.Request) (models.ProfileSecrets, string, bool) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return models.ProfileSecrets{}, "", false
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return models.ProfileSecrets{}, "", false
	}

	return secrets, bucket, true
}

func writeBucketGovernanceSectionError(w http.ResponseWriter, err error, provider models.ProfileProvider, bucket string, spec bucketGovernanceSectionSpec) {
	writeBucketGovernanceError(w, err, spec.UnsupportedCode, spec.UnsupportedMessage, bucketGovernanceSectionDetails(provider, bucket, spec))
}

func bucketGovernanceSectionDetails(provider models.ProfileProvider, bucket string, spec bucketGovernanceSectionSpec) map[string]any {
	details := map[string]any{
		"provider": provider,
		"bucket":   strings.TrimSpace(bucket),
	}
	if spec.Section != "" {
		details["section"] = spec.Section
	}
	if spec.Capability != "" {
		details["capability"] = spec.Capability
		if reason := bucketgov.CapabilityReason(provider, spec.Capability); reason != "" {
			details["reason"] = reason
		}
	}
	return details
}

func writeBucketGovernanceError(w http.ResponseWriter, err error, unsupportedCode string, unsupportedMessage string, unsupportedDetails map[string]any) {
	var opErr *bucketgov.OperationError
	if errors.As(err, &opErr) {
		writeError(w, opErr.Status, opErr.Code, opErr.Message, opErr.Details)
		return
	}

	var unsupportedProvider bucketgov.UnsupportedProviderError
	if errors.As(err, &unsupportedProvider) {
		details := cloneMap(unsupportedDetails)
		details["provider"] = unsupportedProvider.Provider
		writeError(w, http.StatusBadRequest, unsupportedCode, unsupportedMessage, details)
		return
	}

	var unsupportedOperation bucketgov.UnsupportedOperationError
	if errors.As(err, &unsupportedOperation) {
		details := cloneMap(unsupportedDetails)
		details["provider"] = unsupportedOperation.Provider
		details["section"] = unsupportedOperation.Section
		writeError(w, http.StatusBadRequest, unsupportedCode, unsupportedMessage, details)
		return
	}

	writeError(w, http.StatusBadGateway, "bucket_governance_error", "failed to process bucket governance request", map[string]any{
		"error": err.Error(),
	})
}

func cloneMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

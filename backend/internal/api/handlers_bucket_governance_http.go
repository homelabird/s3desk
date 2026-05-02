package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketGovernanceSummaryHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketGovernanceSummaryPreparedRequest struct {
	secrets models.ProfileSecrets
	bucket  string
	err     error
}

type bucketGovernanceSummaryHTTPService struct {
	server *server
}

func (e *bucketGovernanceSummaryHTTPError) Error() string {
	return e.message
}

func newBucketGovernanceSummaryHTTPService(s *server) bucketGovernanceSummaryHTTPService {
	return bucketGovernanceSummaryHTTPService{server: s}
}

func newBucketGovernanceSummaryHTTPError(status int, code, message string, details map[string]any) *bucketGovernanceSummaryHTTPError {
	return &bucketGovernanceSummaryHTTPError{status: status, code: code, message: message, details: details}
}

func buildBucketGovernanceSummaryHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc bucketGovernanceSummaryHTTPService) prepareGetBucketGovernance(r *http.Request) bucketGovernanceSummaryPreparedRequest {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return bucketGovernanceSummaryPreparedRequest{err: newBucketGovernanceSummaryHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)}
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return bucketGovernanceSummaryPreparedRequest{err: newBucketGovernanceSummaryHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)}
	}

	return bucketGovernanceSummaryPreparedRequest{secrets: secrets, bucket: bucket}
}

func (svc bucketGovernanceSummaryHTTPService) executeGet(r *http.Request) (*models.BucketGovernanceView, models.ProfileProvider, string, error) {
	prepared := svc.prepareGetBucketGovernance(r)
	if prepared.err != nil {
		return nil, "", "", prepared.err
	}

	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketGovernanceSummaryHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetGovernance(r.Context(), prepared.secrets, prepared.bucket)
	if err != nil {
		return nil, prepared.secrets.Provider, prepared.bucket, err
	}

	return &view, "", "", nil
}

func (svc bucketGovernanceSummaryHTTPService) handleGetBucketGovernance(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "governance",
			UnsupportedCode:    "bucket_governance_unsupported",
			UnsupportedMessage: "bucket governance is not supported for this provider",
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketGovernanceSummaryHTTPError); ok {
		resp := buildBucketGovernanceSummaryHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketGovernanceSummaryHTTPErrorResponse("internal_error", "failed to load bucket governance", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

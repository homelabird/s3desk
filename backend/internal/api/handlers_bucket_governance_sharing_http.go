package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketSharingHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketSharingPreparedRequest struct {
	secrets models.ProfileSecrets
	bucket  string
	putReq  models.BucketSharingPutRequest
	err     error
}

type bucketSharingHTTPService struct {
	server *server
}

func (e *bucketSharingHTTPError) Error() string {
	return e.message
}

func newBucketSharingHTTPService(s *server) bucketSharingHTTPService {
	return bucketSharingHTTPService{server: s}
}

func newBucketSharingHTTPError(status int, code, message string, details map[string]any) *bucketSharingHTTPError {
	return &bucketSharingHTTPError{status: status, code: code, message: message, details: details}
}

func buildBucketSharingHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc bucketSharingHTTPService) prepareBucketSharing(r *http.Request) bucketSharingPreparedRequest {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return bucketSharingPreparedRequest{err: newBucketSharingHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)}
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return bucketSharingPreparedRequest{err: newBucketSharingHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)}
	}

	return bucketSharingPreparedRequest{secrets: secrets, bucket: bucket}
}

func (svc bucketSharingHTTPService) preparePutBucketSharing(r *http.Request) bucketSharingPreparedRequest {
	prepared := svc.prepareBucketSharing(r)
	if prepared.err != nil {
		return prepared
	}

	var req models.BucketSharingPutRequest
	if err := decodeJSON(r, &req); err != nil {
		prepared.err = newBucketSharingHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return prepared
	}
	prepared.putReq = req
	return prepared
}

func (svc bucketSharingHTTPService) executeGet(r *http.Request) (*models.BucketSharingView, models.ProfileProvider, string, error) {
	prepared := svc.prepareBucketSharing(r)
	if prepared.err != nil {
		return nil, "", "", prepared.err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketSharingHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetSharing(r.Context(), prepared.secrets, prepared.bucket)
	if err != nil {
		return nil, prepared.secrets.Provider, prepared.bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketSharingHTTPService) executePut(r *http.Request) (*models.BucketSharingView, models.ProfileProvider, string, error) {
	prepared := svc.preparePutBucketSharing(r)
	if prepared.err != nil {
		return nil, "", "", prepared.err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketSharingHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.PutSharing(r.Context(), prepared.secrets, prepared.bucket, prepared.putReq)
	if err != nil {
		return nil, prepared.secrets.Provider, prepared.bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketSharingHTTPService) handleGetBucketSharing(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "sharing",
			UnsupportedCode:    "bucket_sharing_unsupported",
			UnsupportedMessage: "bucket sharing controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityPAR,
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketSharingHTTPError); ok {
		resp := buildBucketSharingHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketSharingHTTPErrorResponse("internal_error", "failed to process bucket sharing request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketSharingHTTPService) handlePutBucketSharing(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executePut(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "sharing",
			UnsupportedCode:    "bucket_sharing_unsupported",
			UnsupportedMessage: "bucket sharing controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityPAR,
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketSharingHTTPError); ok {
		resp := buildBucketSharingHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketSharingHTTPErrorResponse("internal_error", "failed to process bucket sharing request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

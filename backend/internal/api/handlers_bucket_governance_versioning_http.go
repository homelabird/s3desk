package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketVersioningHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketVersioningPreparedRequest struct {
	secrets models.ProfileSecrets
	bucket  string
	putReq  models.BucketVersioningPutRequest
	err     error
}

type bucketVersioningHTTPService struct {
	server *server
}

func (e *bucketVersioningHTTPError) Error() string {
	return e.message
}

func newBucketVersioningHTTPService(s *server) bucketVersioningHTTPService {
	return bucketVersioningHTTPService{server: s}
}

func newBucketVersioningHTTPError(status int, code, message string, details map[string]any) *bucketVersioningHTTPError {
	return &bucketVersioningHTTPError{status: status, code: code, message: message, details: details}
}

func (svc bucketVersioningHTTPService) prepareBucketVersioning(r *http.Request) bucketVersioningPreparedRequest {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return bucketVersioningPreparedRequest{err: newBucketVersioningHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)}
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return bucketVersioningPreparedRequest{err: newBucketVersioningHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)}
	}

	return bucketVersioningPreparedRequest{secrets: secrets, bucket: bucket}
}

func (svc bucketVersioningHTTPService) preparePutBucketVersioning(r *http.Request) bucketVersioningPreparedRequest {
	prepared := svc.prepareBucketVersioning(r)
	if prepared.err != nil {
		return prepared
	}

	var req models.BucketVersioningPutRequest
	if err := decodeJSON(r, &req); err != nil {
		prepared.err = newBucketVersioningHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return prepared
	}
	prepared.putReq = req
	return prepared
}

func (svc bucketVersioningHTTPService) executeGet(r *http.Request) (*models.BucketVersioningView, models.ProfileProvider, string, error) {
	prepared := svc.prepareBucketVersioning(r)
	if prepared.err != nil {
		return nil, "", "", prepared.err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketVersioningHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetVersioning(r.Context(), prepared.secrets, prepared.bucket)
	if err != nil {
		return nil, prepared.secrets.Provider, prepared.bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketVersioningHTTPService) executePut(r *http.Request) (*models.BucketVersioningView, bool, models.ProfileProvider, string, error) {
	prepared := svc.preparePutBucketVersioning(r)
	if prepared.err != nil {
		return nil, false, "", "", prepared.err
	}
	if svc.server.bucketGov == nil {
		return nil, false, "", "", newBucketVersioningHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	if err := svc.server.bucketGov.PutVersioning(r.Context(), prepared.secrets, prepared.bucket, prepared.putReq); err != nil {
		return nil, false, prepared.secrets.Provider, prepared.bucket, err
	}
	return nil, true, "", "", nil
}

func (svc bucketVersioningHTTPService) handleGetBucketVersioning(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "versioning",
			UnsupportedCode:    "bucket_versioning_unsupported",
			UnsupportedMessage: "bucket versioning controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityVersioning,
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketVersioningHTTPError); ok {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to process bucket versioning request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketVersioningHTTPService) handlePutBucketVersioning(w http.ResponseWriter, r *http.Request) {
	view, noContent, provider, bucket, err := svc.executePut(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "versioning",
			UnsupportedCode:    "bucket_versioning_unsupported",
			UnsupportedMessage: "bucket versioning controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityVersioning,
		})
		return
	}
	if err == nil {
		if noContent {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketVersioningHTTPError); ok {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to process bucket versioning request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketLifecycleHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketLifecycleHTTPService struct {
	server *server
}

func (e *bucketLifecycleHTTPError) Error() string {
	return e.message
}

func newBucketLifecycleHTTPService(s *server) bucketLifecycleHTTPService {
	return bucketLifecycleHTTPService{server: s}
}

func newBucketLifecycleHTTPError(status int, code, message string, details map[string]any) *bucketLifecycleHTTPError {
	return &bucketLifecycleHTTPError{status: status, code: code, message: message, details: details}
}

func buildBucketLifecycleHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc bucketLifecycleHTTPService) prepareBucketLifecycle(r *http.Request) (models.ProfileSecrets, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", newBucketLifecycleHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", newBucketLifecycleHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	return secrets, bucket, nil
}

func (svc bucketLifecycleHTTPService) preparePutBucketLifecycle(r *http.Request) (models.ProfileSecrets, string, models.BucketLifecyclePutRequest, error) {
	secrets, bucket, err := svc.prepareBucketLifecycle(r)
	if err != nil {
		return models.ProfileSecrets{}, "", models.BucketLifecyclePutRequest{}, err
	}

	var req models.BucketLifecyclePutRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", models.BucketLifecyclePutRequest{}, newBucketLifecycleHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	return secrets, bucket, req, nil
}

func (svc bucketLifecycleHTTPService) executeGet(r *http.Request) (*models.BucketLifecycleView, models.ProfileProvider, string, error) {
	secrets, bucket, err := svc.prepareBucketLifecycle(r)
	if err != nil {
		return nil, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketLifecycleHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetLifecycle(r.Context(), secrets, bucket)
	if err != nil {
		return nil, secrets.Provider, bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketLifecycleHTTPService) executePut(r *http.Request) (*models.BucketLifecycleView, bool, models.ProfileProvider, string, error) {
	secrets, bucket, putReq, err := svc.preparePutBucketLifecycle(r)
	if err != nil {
		return nil, false, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, false, "", "", newBucketLifecycleHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	if err := svc.server.bucketGov.PutLifecycle(r.Context(), secrets, bucket, putReq); err != nil {
		return nil, false, secrets.Provider, bucket, err
	}
	return nil, true, "", "", nil
}

func (svc bucketLifecycleHTTPService) handleGetBucketLifecycle(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "lifecycle",
			UnsupportedCode:    "bucket_lifecycle_unsupported",
			UnsupportedMessage: "bucket lifecycle controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityLifecycle,
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketLifecycleHTTPError); ok {
		resp := buildBucketLifecycleHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketLifecycleHTTPErrorResponse("internal_error", "failed to process bucket lifecycle request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketLifecycleHTTPService) handlePutBucketLifecycle(w http.ResponseWriter, r *http.Request) {
	view, noContent, provider, bucket, err := svc.executePut(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "lifecycle",
			UnsupportedCode:    "bucket_lifecycle_unsupported",
			UnsupportedMessage: "bucket lifecycle controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityLifecycle,
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
	if httpErr, ok := err.(*bucketLifecycleHTTPError); ok {
		resp := buildBucketLifecycleHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketLifecycleHTTPErrorResponse("internal_error", "failed to process bucket lifecycle request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

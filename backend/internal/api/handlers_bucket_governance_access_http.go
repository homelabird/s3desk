package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketAccessHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketAccessHTTPService struct {
	server *server
}

func (e *bucketAccessHTTPError) Error() string {
	return e.message
}

func newBucketAccessHTTPService(s *server) bucketAccessHTTPService {
	return bucketAccessHTTPService{server: s}
}

func newBucketAccessHTTPError(status int, code, message string, details map[string]any) *bucketAccessHTTPError {
	return &bucketAccessHTTPError{status: status, code: code, message: message, details: details}
}

func buildBucketAccessHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc bucketAccessHTTPService) prepareBucketAccess(r *http.Request) (models.ProfileSecrets, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", newBucketAccessHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", newBucketAccessHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	return secrets, bucket, nil
}

func (svc bucketAccessHTTPService) preparePutBucketAccess(r *http.Request) (models.ProfileSecrets, string, models.BucketAccessPutRequest, error) {
	secrets, bucket, err := svc.prepareBucketAccess(r)
	if err != nil {
		return models.ProfileSecrets{}, "", models.BucketAccessPutRequest{}, err
	}

	var req models.BucketAccessPutRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", models.BucketAccessPutRequest{}, newBucketAccessHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	return secrets, bucket, req, nil
}

func (svc bucketAccessHTTPService) executeGet(r *http.Request) (*models.BucketAccessView, models.ProfileProvider, string, error) {
	secrets, bucket, err := svc.prepareBucketAccess(r)
	if err != nil {
		return nil, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketAccessHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetAccess(r.Context(), secrets, bucket)
	if err != nil {
		return nil, secrets.Provider, bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketAccessHTTPService) executePut(r *http.Request) (*models.BucketAccessView, bool, models.ProfileProvider, string, error) {
	secrets, bucket, putReq, err := svc.preparePutBucketAccess(r)
	if err != nil {
		return nil, false, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, false, "", "", newBucketAccessHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	if err := svc.server.bucketGov.PutAccess(r.Context(), secrets, bucket, putReq); err != nil {
		return nil, false, secrets.Provider, bucket, err
	}
	return nil, true, "", "", nil
}

func (svc bucketAccessHTTPService) handleGetBucketAccess(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "access",
			UnsupportedCode:    "bucket_access_unsupported",
			UnsupportedMessage: "bucket access controls are not supported for this provider",
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketAccessHTTPError); ok {
		resp := buildBucketAccessHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketAccessHTTPErrorResponse("internal_error", "failed to process bucket access request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketAccessHTTPService) handlePutBucketAccess(w http.ResponseWriter, r *http.Request) {
	view, noContent, provider, bucket, err := svc.executePut(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "access",
			UnsupportedCode:    "bucket_access_unsupported",
			UnsupportedMessage: "bucket access controls are not supported for this provider",
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
	if httpErr, ok := err.(*bucketAccessHTTPError); ok {
		resp := buildBucketAccessHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketAccessHTTPErrorResponse("internal_error", "failed to process bucket access request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

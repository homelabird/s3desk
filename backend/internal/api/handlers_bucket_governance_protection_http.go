package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketProtectionHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketProtectionHTTPService struct {
	server *server
}

func (e *bucketProtectionHTTPError) Error() string {
	return e.message
}

func newBucketProtectionHTTPService(s *server) bucketProtectionHTTPService {
	return bucketProtectionHTTPService{server: s}
}

func newBucketProtectionHTTPError(status int, code, message string, details map[string]any) *bucketProtectionHTTPError {
	return &bucketProtectionHTTPError{status: status, code: code, message: message, details: details}
}

func buildBucketProtectionHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc bucketProtectionHTTPService) prepareBucketProtection(r *http.Request) (models.ProfileSecrets, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", newBucketProtectionHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", newBucketProtectionHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	return secrets, bucket, nil
}

func (svc bucketProtectionHTTPService) preparePutBucketProtection(r *http.Request) (models.ProfileSecrets, string, models.BucketProtectionPutRequest, error) {
	secrets, bucket, err := svc.prepareBucketProtection(r)
	if err != nil {
		return models.ProfileSecrets{}, "", models.BucketProtectionPutRequest{}, err
	}

	var req models.BucketProtectionPutRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", models.BucketProtectionPutRequest{}, newBucketProtectionHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	return secrets, bucket, req, nil
}

func (svc bucketProtectionHTTPService) executeGet(r *http.Request) (*models.BucketProtectionView, models.ProfileProvider, string, error) {
	secrets, bucket, err := svc.prepareBucketProtection(r)
	if err != nil {
		return nil, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketProtectionHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetProtection(r.Context(), secrets, bucket)
	if err != nil {
		return nil, secrets.Provider, bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketProtectionHTTPService) executePut(r *http.Request) (*models.BucketProtectionView, bool, models.ProfileProvider, string, error) {
	secrets, bucket, putReq, err := svc.preparePutBucketProtection(r)
	if err != nil {
		return nil, false, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, false, "", "", newBucketProtectionHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	if err := svc.server.bucketGov.PutProtection(r.Context(), secrets, bucket, putReq); err != nil {
		return nil, false, secrets.Provider, bucket, err
	}
	return nil, true, "", "", nil
}

func (svc bucketProtectionHTTPService) handleGetBucketProtection(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "protection",
			UnsupportedCode:    "bucket_protection_unsupported",
			UnsupportedMessage: "bucket protection controls are not supported for this provider",
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketProtectionHTTPError); ok {
		resp := buildBucketProtectionHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketProtectionHTTPErrorResponse("internal_error", "failed to process bucket protection request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketProtectionHTTPService) handlePutBucketProtection(w http.ResponseWriter, r *http.Request) {
	view, noContent, provider, bucket, err := svc.executePut(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "protection",
			UnsupportedCode:    "bucket_protection_unsupported",
			UnsupportedMessage: "bucket protection controls are not supported for this provider",
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
	if httpErr, ok := err.(*bucketProtectionHTTPError); ok {
		resp := buildBucketProtectionHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildBucketProtectionHTTPErrorResponse("internal_error", "failed to process bucket protection request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

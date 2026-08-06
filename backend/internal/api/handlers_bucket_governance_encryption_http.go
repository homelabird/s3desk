package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketEncryptionHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketEncryptionHTTPService struct {
	server *server
}

func (e *bucketEncryptionHTTPError) Error() string {
	return e.message
}

func newBucketEncryptionHTTPService(s *server) bucketEncryptionHTTPService {
	return bucketEncryptionHTTPService{server: s}
}

func newBucketEncryptionHTTPError(status int, code, message string, details map[string]any) *bucketEncryptionHTTPError {
	return &bucketEncryptionHTTPError{status: status, code: code, message: message, details: details}
}

func (svc bucketEncryptionHTTPService) prepareBucketEncryption(r *http.Request) (models.ProfileSecrets, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", newBucketEncryptionHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", newBucketEncryptionHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	return secrets, bucket, nil
}

func (svc bucketEncryptionHTTPService) preparePutBucketEncryption(r *http.Request) (models.ProfileSecrets, string, models.BucketEncryptionPutRequest, error) {
	secrets, bucket, err := svc.prepareBucketEncryption(r)
	if err != nil {
		return models.ProfileSecrets{}, "", models.BucketEncryptionPutRequest{}, err
	}

	var req models.BucketEncryptionPutRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", models.BucketEncryptionPutRequest{}, newBucketEncryptionHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	return secrets, bucket, req, nil
}

func (svc bucketEncryptionHTTPService) executeGet(r *http.Request) (*models.BucketEncryptionView, models.ProfileProvider, string, error) {
	secrets, bucket, err := svc.prepareBucketEncryption(r)
	if err != nil {
		return nil, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketEncryptionHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetEncryption(r.Context(), secrets, bucket)
	if err != nil {
		return nil, secrets.Provider, bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketEncryptionHTTPService) executePut(r *http.Request) (*models.BucketEncryptionView, bool, models.ProfileProvider, string, error) {
	secrets, bucket, putReq, err := svc.preparePutBucketEncryption(r)
	if err != nil {
		return nil, false, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, false, "", "", newBucketEncryptionHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	if err := svc.server.bucketGov.PutEncryption(r.Context(), secrets, bucket, putReq); err != nil {
		return nil, false, secrets.Provider, bucket, err
	}
	return nil, true, "", "", nil
}

func (svc bucketEncryptionHTTPService) handleGetBucketEncryption(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "encryption",
			UnsupportedCode:    "bucket_encryption_unsupported",
			UnsupportedMessage: "bucket encryption controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityDefaultEncryption,
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketEncryptionHTTPError); ok {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to process bucket encryption request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketEncryptionHTTPService) handlePutBucketEncryption(w http.ResponseWriter, r *http.Request) {
	view, noContent, provider, bucket, err := svc.executePut(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "encryption",
			UnsupportedCode:    "bucket_encryption_unsupported",
			UnsupportedMessage: "bucket encryption controls are not supported for this provider",
			Capability:         models.BucketGovernanceCapabilityDefaultEncryption,
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
	if httpErr, ok := err.(*bucketEncryptionHTTPError); ok {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to process bucket encryption request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketPublicExposureHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketPublicExposureHTTPService struct {
	server *server
}

func (e *bucketPublicExposureHTTPError) Error() string {
	return e.message
}

func newBucketPublicExposureHTTPService(s *server) bucketPublicExposureHTTPService {
	return bucketPublicExposureHTTPService{server: s}
}

func newBucketPublicExposureHTTPError(status int, code, message string, details map[string]any) *bucketPublicExposureHTTPError {
	return &bucketPublicExposureHTTPError{status: status, code: code, message: message, details: details}
}

func (svc bucketPublicExposureHTTPService) prepareBucketPublicExposure(r *http.Request) (models.ProfileSecrets, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", newBucketPublicExposureHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", newBucketPublicExposureHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	return secrets, bucket, nil
}

func (svc bucketPublicExposureHTTPService) preparePutBucketPublicExposure(r *http.Request) (models.ProfileSecrets, string, models.BucketPublicExposurePutRequest, error) {
	secrets, bucket, err := svc.prepareBucketPublicExposure(r)
	if err != nil {
		return models.ProfileSecrets{}, "", models.BucketPublicExposurePutRequest{}, err
	}

	var req models.BucketPublicExposurePutRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", models.BucketPublicExposurePutRequest{}, newBucketPublicExposureHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	return secrets, bucket, req, nil
}

func (svc bucketPublicExposureHTTPService) executeGet(r *http.Request) (*models.BucketPublicExposureView, models.ProfileProvider, string, error) {
	secrets, bucket, err := svc.prepareBucketPublicExposure(r)
	if err != nil {
		return nil, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, "", "", newBucketPublicExposureHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	view, err := svc.server.bucketGov.GetPublicExposure(r.Context(), secrets, bucket)
	if err != nil {
		return nil, secrets.Provider, bucket, err
	}
	return &view, "", "", nil
}

func (svc bucketPublicExposureHTTPService) executePut(r *http.Request) (*models.BucketPublicExposureView, bool, models.ProfileProvider, string, error) {
	secrets, bucket, putReq, err := svc.preparePutBucketPublicExposure(r)
	if err != nil {
		return nil, false, "", "", err
	}
	if svc.server.bucketGov == nil {
		return nil, false, "", "", newBucketPublicExposureHTTPError(http.StatusInternalServerError, "internal_error", "bucket governance service is not configured", nil)
	}

	if err := svc.server.bucketGov.PutPublicExposure(r.Context(), secrets, bucket, putReq); err != nil {
		return nil, false, secrets.Provider, bucket, err
	}
	return nil, true, "", "", nil
}

func (svc bucketPublicExposureHTTPService) handleGetBucketPublicExposure(w http.ResponseWriter, r *http.Request) {
	view, provider, bucket, err := svc.executeGet(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "public-exposure",
			UnsupportedCode:    "bucket_public_exposure_unsupported",
			UnsupportedMessage: "bucket public exposure is not supported for this provider",
		})
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if httpErr, ok := err.(*bucketPublicExposureHTTPError); ok {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to process bucket public exposure request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketPublicExposureHTTPService) handlePutBucketPublicExposure(w http.ResponseWriter, r *http.Request) {
	view, noContent, provider, bucket, err := svc.executePut(r)
	if provider != "" && bucket != "" {
		writeBucketGovernanceSectionError(w, err, provider, bucket, bucketGovernanceSectionSpec{
			Section:            "public-exposure",
			UnsupportedCode:    "bucket_public_exposure_unsupported",
			UnsupportedMessage: "bucket public exposure is not supported for this provider",
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
	if httpErr, ok := err.(*bucketPublicExposureHTTPError); ok {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}
	resp := buildAPIErrorResponse("internal_error", "failed to process bucket public exposure request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

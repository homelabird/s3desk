package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type bucketPolicyValidateHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketPolicyValidateHTTPService struct {
	server *server
}

func (e *bucketPolicyValidateHTTPError) Error() string {
	return e.message
}

func newBucketPolicyValidateHTTPService(s *server) bucketPolicyValidateHTTPService {
	return bucketPolicyValidateHTTPService{server: s}
}

func newBucketPolicyValidateHTTPError(status int, code, message string, details map[string]any) *bucketPolicyValidateHTTPError {
	return &bucketPolicyValidateHTTPError{status: status, code: code, message: message, details: details}
}

func buildBucketPolicyValidateHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc bucketPolicyValidateHTTPService) prepareValidateBucketPolicy(r *http.Request) (models.ProfileSecrets, string, models.BucketPolicyPutRequest, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", models.BucketPolicyPutRequest{}, newBucketPolicyValidateHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", models.BucketPolicyPutRequest{}, newBucketPolicyValidateHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	var req models.BucketPolicyPutRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", models.BucketPolicyPutRequest{}, newBucketPolicyValidateHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}

	return secrets, bucket, req, nil
}

func (svc bucketPolicyValidateHTTPService) executePrepared(secrets models.ProfileSecrets, bucket string, putReq models.BucketPolicyPutRequest) (*models.BucketPolicyValidateResponse, error) {
	if len(putReq.Policy) == 0 || strings.TrimSpace(string(putReq.Policy)) == "" {
		return &models.BucketPolicyValidateResponse{
			Ok:       false,
			Provider: secrets.Provider,
			Errors:   []string{"policy is required"},
		}, nil
	}

	var raw any
	if err := json.Unmarshal(putReq.Policy, &raw); err != nil {
		return &models.BucketPolicyValidateResponse{
			Ok:       false,
			Provider: secrets.Provider,
			Errors:   []string{"policy must be valid JSON"},
			Warnings: []string{err.Error()},
		}, nil
	}

	errs, warns := validateBucketPolicyStatic(secrets.Provider, bucket, raw)
	return &models.BucketPolicyValidateResponse{
		Ok:       len(errs) == 0,
		Provider: secrets.Provider,
		Errors:   errs,
		Warnings: warns,
	}, nil
}

func (svc bucketPolicyValidateHTTPService) executeValidate(r *http.Request) (*models.BucketPolicyValidateResponse, error) {
	secrets, bucket, putReq, err := svc.prepareValidateBucketPolicy(r)
	if err != nil {
		return nil, err
	}
	return svc.executePrepared(secrets, bucket, putReq)
}

func (svc bucketPolicyValidateHTTPService) handleValidateBucketPolicy(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeValidate(r)
	if err != nil {
		var reqErr *bucketPolicyValidateHTTPError
		if errors.As(err, &reqErr) {
			respErr := buildBucketPolicyValidateHTTPErrorResponse(reqErr.code, reqErr.message, reqErr.details)
			writeJSON(w, reqErr.status, &respErr)
			return
		}
		respErr := buildBucketPolicyValidateHTTPErrorResponse(
			"internal_error",
			"failed to validate bucket policy",
			map[string]any{"error": err.Error()},
		)
		writeJSON(w, http.StatusInternalServerError, &respErr)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

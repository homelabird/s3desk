package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/bucketpolicy"
	"s3desk/internal/models"
)

type bucketPolicyHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type bucketPolicyHTTPService struct {
	server *server
	policy *bucketpolicy.Service
}

func (e *bucketPolicyHTTPError) Error() string {
	return e.message
}

func newBucketPolicyHTTPService(s *server) bucketPolicyHTTPService {
	allowRemote := s != nil && s.cfg.AllowRemote
	return bucketPolicyHTTPService{
		server: s,
		policy: bucketpolicy.NewService(allowRemote),
	}
}

func policyCallErrors(err error) (callErr, requestErr error) {
	if err == nil {
		return nil, nil
	}
	var unsupported *bucketpolicy.UnsupportedProviderError
	if errors.As(err, &unsupported) {
		if unsupported.Operation == "delete" && unsupported.Provider == models.ProfileProviderGcpGcs {
			return nil, newBucketPolicyHTTPError(http.StatusBadRequest, "bucket_policy_delete_unsupported", "GCS IAM policy cannot be deleted; update it instead", map[string]any{
				"provider": unsupported.Provider,
			})
		}
		return nil, newBucketPolicyHTTPError(http.StatusBadRequest, "bucket_policy_unsupported", "policy is not supported for this provider", map[string]any{
			"provider": unsupported.Provider,
		})
	}
	return err, nil
}

func newBucketPolicyHTTPError(status int, code, message string, details map[string]any) *bucketPolicyHTTPError {
	return &bucketPolicyHTTPError{status: status, code: code, message: message, details: details}
}

func (svc bucketPolicyHTTPService) prepareBucketPolicy(r *http.Request) (models.ProfileSecrets, string, error) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return models.ProfileSecrets{}, "", newBucketPolicyHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}
	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return models.ProfileSecrets{}, "", newBucketPolicyHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}
	return secrets, bucket, nil
}

func (svc bucketPolicyHTTPService) preparePutBucketPolicy(r *http.Request) (models.ProfileSecrets, string, models.BucketPolicyPutRequest, error) {
	secrets, bucket, err := svc.prepareBucketPolicy(r)
	if err != nil {
		return models.ProfileSecrets{}, "", models.BucketPolicyPutRequest{}, err
	}
	var req models.BucketPolicyPutRequest
	if err := decodeJSON(r, &req); err != nil {
		return models.ProfileSecrets{}, "", models.BucketPolicyPutRequest{}, newBucketPolicyHTTPError(http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
	}
	if len(req.Policy) == 0 || strings.TrimSpace(string(req.Policy)) == "" {
		return models.ProfileSecrets{}, "", models.BucketPolicyPutRequest{}, newBucketPolicyHTTPError(http.StatusBadRequest, "invalid_request", "policy is required", nil)
	}
	return secrets, bucket, req, nil
}

func (svc bucketPolicyHTTPService) executeGet(r *http.Request) (*models.BucketPolicyResponse, string, error, bucketpolicy.Response, int, http.Header, []byte, string, error) {
	secrets, bucket, err := svc.prepareBucketPolicy(r)
	if err != nil {
		return nil, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", err
	}

	resp, err := svc.policy.Get(r.Context(), secrets, bucket)
	callErr, requestErr := policyCallErrors(err)
	if requestErr != nil {
		return nil, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", requestErr
	}
	if callErr != nil {
		return nil, bucket, callErr, bucketpolicy.Response{}, 0, nil, nil, "", nil
	}

	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		switch resp.Status {
		case http.StatusOK:
			return &models.BucketPolicyResponse{Bucket: bucket, Exists: true, Policy: resp.Body}, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		case http.StatusNotFound:
			e := parseXMLError(resp.Body)
			if isNoSuchBucketPolicy(e.Code, e.Message) {
				return &models.BucketPolicyResponse{Bucket: bucket, Exists: false}, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
			}
			if isNoSuchBucket(e.Code, e.Message) {
				return nil, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", newBucketPolicyHTTPError(http.StatusNotFound, string(models.NormalizedErrorNotFound), "bucket not found", map[string]any{"bucket": bucket, "upstreamCode": e.Code})
			}
			return nil, "", nil, resp, 0, nil, nil, "", nil
		default:
			return nil, "", nil, resp, 0, nil, nil, "", nil
		}
	case models.ProfileProviderGcpGcs:
		if resp.Status == http.StatusOK {
			return &models.BucketPolicyResponse{Bucket: bucket, Exists: true, Policy: resp.Body}, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		}
		if resp.Status == http.StatusNotFound {
			return nil, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", newBucketPolicyHTTPError(http.StatusNotFound, string(models.NormalizedErrorNotFound), "bucket not found", map[string]any{"bucket": bucket})
		}
		return nil, "", nil, bucketpolicy.Response{}, resp.Status, resp.Headers, resp.Body, "gcs", nil
	case models.ProfileProviderAzureBlob:
		if resp.Status == http.StatusOK {
			return &models.BucketPolicyResponse{Bucket: bucket, Exists: true, Policy: resp.Body}, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		}
		if resp.Status == http.StatusNotFound {
			return nil, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", newBucketPolicyHTTPError(http.StatusNotFound, string(models.NormalizedErrorNotFound), "container not found", map[string]any{"bucket": bucket})
		}
		return nil, "", nil, bucketpolicy.Response{}, resp.Status, resp.Headers, resp.Body, "azure", nil
	}
	return nil, "", nil, bucketpolicy.Response{}, 0, nil, nil, "", newBucketPolicyHTTPError(http.StatusBadRequest, "bucket_policy_unsupported", "policy is not supported for this provider", map[string]any{"provider": secrets.Provider})
}

func (svc bucketPolicyHTTPService) executePut(r *http.Request) (string, error, bucketpolicy.Response, int, http.Header, []byte, string, error) {
	secrets, bucket, putReq, err := svc.preparePutBucketPolicy(r)
	if err != nil {
		return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", err
	}

	resp, err := svc.policy.Put(r.Context(), secrets, bucket, putReq.Policy)
	callErr, requestErr := policyCallErrors(err)
	if requestErr != nil {
		return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", requestErr
	}
	if callErr != nil {
		return bucket, callErr, bucketpolicy.Response{}, 0, nil, nil, "", nil
	}

	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		if resp.Status == http.StatusNoContent || resp.Status == http.StatusOK {
			return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		}
		return "", nil, resp, 0, nil, nil, "", nil
	case models.ProfileProviderGcpGcs:
		if resp.Status == http.StatusOK {
			return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		}
		return "", nil, bucketpolicy.Response{}, resp.Status, resp.Headers, resp.Body, "gcs", nil
	case models.ProfileProviderAzureBlob:
		if resp.Status == http.StatusOK || resp.Status == http.StatusNoContent {
			return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		}
		return "", nil, bucketpolicy.Response{}, resp.Status, resp.Headers, resp.Body, "azure", nil
	}
	return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", newBucketPolicyHTTPError(http.StatusBadRequest, "bucket_policy_unsupported", "policy is not supported for this provider", map[string]any{"provider": secrets.Provider})
}

func (svc bucketPolicyHTTPService) executeDelete(r *http.Request) (string, error, bucketpolicy.Response, int, http.Header, []byte, string, error) {
	secrets, bucket, err := svc.prepareBucketPolicy(r)
	if err != nil {
		return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", err
	}

	resp, err := svc.policy.Delete(r.Context(), secrets, bucket)
	callErr, requestErr := policyCallErrors(err)
	if requestErr != nil {
		return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", requestErr
	}
	if callErr != nil {
		return bucket, callErr, bucketpolicy.Response{}, 0, nil, nil, "", nil
	}

	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		switch resp.Status {
		case http.StatusNoContent, http.StatusOK:
			return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		case http.StatusNotFound:
			e := parseXMLError(resp.Body)
			if isNoSuchBucketPolicy(e.Code, e.Message) {
				return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
			}
			if isNoSuchBucket(e.Code, e.Message) {
				return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", newBucketPolicyHTTPError(http.StatusNotFound, string(models.NormalizedErrorNotFound), "bucket not found", map[string]any{"bucket": bucket, "upstreamCode": e.Code})
			}
			return "", nil, resp, 0, nil, nil, "", nil
		default:
			return "", nil, resp, 0, nil, nil, "", nil
		}
	case models.ProfileProviderAzureBlob:
		if resp.Status == http.StatusOK || resp.Status == http.StatusNoContent {
			return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", nil
		}
		return "", nil, bucketpolicy.Response{}, resp.Status, resp.Headers, resp.Body, "azure", nil
	}
	return "", nil, bucketpolicy.Response{}, 0, nil, nil, "", newBucketPolicyHTTPError(http.StatusBadRequest, "bucket_policy_unsupported", "policy is not supported for this provider", map[string]any{"provider": secrets.Provider})
}

func (svc bucketPolicyHTTPService) handleGetBucketPolicy(w http.ResponseWriter, r *http.Request) {
	resp, callBucket, callErr, s3UpstreamResp, genericUpstreamStatus, genericUpstreamHeaders, genericUpstreamBody, providerHint, err := svc.executeGet(r)
	if callErr != nil {
		svc.server.writeS3PolicyCallError(w, "get", callBucket, callErr)
		return
	}
	if s3UpstreamResp.Status != 0 {
		svc.server.writeS3PolicyUpstreamError(w, "get", chi.URLParam(r, "bucket"), s3UpstreamResp)
		return
	}
	if genericUpstreamStatus != 0 {
		svc.server.writeGenericPolicyUpstreamError(w, "get", chi.URLParam(r, "bucket"), genericUpstreamStatus, genericUpstreamHeaders, genericUpstreamBody, providerHint)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var httpErr *bucketPolicyHTTPError
	if errors.As(err, &httpErr) {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}

	respErr := buildAPIErrorResponse("internal_error", "failed to handle bucket policy request", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

func (svc bucketPolicyHTTPService) handlePutBucketPolicy(w http.ResponseWriter, r *http.Request) {
	callBucket, callErr, s3UpstreamResp, genericUpstreamStatus, genericUpstreamHeaders, genericUpstreamBody, providerHint, err := svc.executePut(r)
	if callErr != nil {
		svc.server.writeS3PolicyCallError(w, "put", callBucket, callErr)
		return
	}
	if s3UpstreamResp.Status != 0 {
		svc.server.writeS3PolicyUpstreamError(w, "put", chi.URLParam(r, "bucket"), s3UpstreamResp)
		return
	}
	if genericUpstreamStatus != 0 {
		svc.server.writeGenericPolicyUpstreamError(w, "put", chi.URLParam(r, "bucket"), genericUpstreamStatus, genericUpstreamHeaders, genericUpstreamBody, providerHint)
		return
	}
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var httpErr *bucketPolicyHTTPError
	if errors.As(err, &httpErr) {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}

	resp := buildAPIErrorResponse("internal_error", "failed to handle bucket policy request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

func (svc bucketPolicyHTTPService) handleDeleteBucketPolicy(w http.ResponseWriter, r *http.Request) {
	callBucket, callErr, s3UpstreamResp, genericUpstreamStatus, genericUpstreamHeaders, genericUpstreamBody, providerHint, err := svc.executeDelete(r)
	if callErr != nil {
		svc.server.writeS3PolicyCallError(w, "delete", callBucket, callErr)
		return
	}
	if s3UpstreamResp.Status != 0 {
		svc.server.writeS3PolicyUpstreamError(w, "delete", chi.URLParam(r, "bucket"), s3UpstreamResp)
		return
	}
	if genericUpstreamStatus != 0 {
		svc.server.writeGenericPolicyUpstreamError(w, "delete", chi.URLParam(r, "bucket"), genericUpstreamStatus, genericUpstreamHeaders, genericUpstreamBody, providerHint)
		return
	}
	if err == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var httpErr *bucketPolicyHTTPError
	if errors.As(err, &httpErr) {
		resp := buildAPIErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, resp)
		return
	}

	resp := buildAPIErrorResponse("internal_error", "failed to handle bucket policy request", nil)
	writeJSON(w, http.StatusInternalServerError, resp)
}

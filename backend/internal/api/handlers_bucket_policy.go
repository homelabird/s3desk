package api

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/azureacl"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
	"s3desk/internal/rcloneerrors"
	"s3desk/internal/s3policy"
)

type xmlErrorEnvelope struct {
	Code      string `xml:"Code"`
	Message   string `xml:"Message"`
	RequestID string `xml:"RequestId"`
	HostID    string `xml:"HostId"`
}

type parsedUpstreamError struct {
	Code      string
	Message   string
	RequestID string
	HostID    string
	Raw       string
}

func parseXMLError(body []byte) parsedUpstreamError {
	raw := strings.TrimSpace(string(body))
	if raw == "" {
		return parsedUpstreamError{}
	}
	var env xmlErrorEnvelope
	if err := xml.Unmarshal(body, &env); err == nil {
		return parsedUpstreamError{
			Code:      strings.TrimSpace(env.Code),
			Message:   strings.TrimSpace(env.Message),
			RequestID: strings.TrimSpace(env.RequestID),
			HostID:    strings.TrimSpace(env.HostID),
			Raw:       raw,
		}
	}
	// Some providers might return plain text.
	return parsedUpstreamError{Raw: raw}
}

type gcsErrorEnvelope struct {
	Error struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Errors  []struct {
			Reason  string `json:"reason"`
			Message string `json:"message"`
		} `json:"errors"`
	} `json:"error"`
}

func parseGCSError(body []byte) parsedUpstreamError {
	raw := strings.TrimSpace(string(body))
	if raw == "" {
		return parsedUpstreamError{}
	}
	var env gcsErrorEnvelope
	if err := json.Unmarshal(body, &env); err == nil {
		msg := strings.TrimSpace(env.Error.Message)
		code := ""
		if len(env.Error.Errors) > 0 {
			code = strings.TrimSpace(env.Error.Errors[0].Reason)
			if msg == "" {
				msg = strings.TrimSpace(env.Error.Errors[0].Message)
			}
		}
		return parsedUpstreamError{Code: code, Message: msg, Raw: raw}
	}
	return parsedUpstreamError{Raw: raw}
}

func isNoSuchBucketPolicy(code string, message string) bool {
	c := strings.ToLower(strings.TrimSpace(code))
	m := strings.ToLower(strings.TrimSpace(message))
	if strings.Contains(c, "nosuchbucketpolicy") || strings.Contains(c, "nosuchpolicy") {
		return true
	}
	return strings.Contains(m, "nosuchbucketpolicy") || strings.Contains(m, "no such bucket policy")
}

func isNoSuchBucket(code string, message string) bool {
	c := strings.ToLower(strings.TrimSpace(code))
	m := strings.ToLower(strings.TrimSpace(message))
	if strings.Contains(c, "nosuchbucket") {
		return true
	}
	return strings.Contains(m, "nosuchbucket") || strings.Contains(m, "bucket does not exist")
}

func (s *server) handleGetBucketPolicy(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		resp, err := s3policy.GetBucketPolicy(r.Context(), secrets, bucket)
		if err != nil {
			s.writeS3PolicyCallError(w, "get", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		switch resp.Status {
		case http.StatusOK:
			writeJSON(w, http.StatusOK, models.BucketPolicyResponse{Bucket: bucket, Exists: true, Policy: resp.Body})
			return
		case http.StatusNotFound:
			e := parseXMLError(resp.Body)
			if isNoSuchBucketPolicy(e.Code, e.Message) {
				writeJSON(w, http.StatusOK, models.BucketPolicyResponse{Bucket: bucket, Exists: false})
				return
			}
			if isNoSuchBucket(e.Code, e.Message) {
				writeError(w, http.StatusNotFound, string(models.NormalizedErrorNotFound), "bucket not found", map[string]any{"bucket": bucket, "upstreamCode": e.Code})
				return
			}
			s.writeS3PolicyUpstreamError(w, "get", bucket, resp)
			return
		default:
			s.writeS3PolicyUpstreamError(w, "get", bucket, resp)
			return
		}

	case models.ProfileProviderGcpGcs:
		resp, err := gcsiam.GetBucketIamPolicy(r.Context(), secrets, bucket)
		if err != nil {
			s.writeS3PolicyCallError(w, "get", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		switch resp.Status {
		case http.StatusOK:
			writeJSON(w, http.StatusOK, models.BucketPolicyResponse{Bucket: bucket, Exists: true, Policy: resp.Body})
			return
		case http.StatusNotFound:
			writeError(w, http.StatusNotFound, string(models.NormalizedErrorNotFound), "bucket not found", map[string]any{"bucket": bucket})
			return
		default:
			s.writeGenericPolicyUpstreamError(w, "get", bucket, resp.Status, resp.Headers, resp.Body, "gcs")
			return
		}

	case models.ProfileProviderAzureBlob:
		resp, err := azureacl.GetContainerPolicy(r.Context(), secrets, bucket)
		if err != nil {
			s.writeS3PolicyCallError(w, "get", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		switch resp.Status {
		case http.StatusOK:
			writeJSON(w, http.StatusOK, models.BucketPolicyResponse{Bucket: bucket, Exists: true, Policy: resp.Body})
			return
		case http.StatusNotFound:
			writeError(w, http.StatusNotFound, string(models.NormalizedErrorNotFound), "container not found", map[string]any{"bucket": bucket})
			return
		default:
			s.writeGenericPolicyUpstreamError(w, "get", bucket, resp.Status, resp.Headers, resp.Body, "azure")
			return
		}
	default:
		writeError(w, http.StatusBadRequest, "bucket_policy_unsupported", "policy is not supported for this provider", map[string]any{"provider": secrets.Provider})
		return
	}
}

func (s *server) handlePutBucketPolicy(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	var req models.BucketPolicyPutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	if len(req.Policy) == 0 || strings.TrimSpace(string(req.Policy)) == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "policy is required", nil)
		return
	}

	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		resp, err := s3policy.PutBucketPolicy(r.Context(), secrets, bucket, req.Policy)
		if err != nil {
			s.writeS3PolicyCallError(w, "put", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		if resp.Status == http.StatusNoContent || resp.Status == http.StatusOK {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.writeS3PolicyUpstreamError(w, "put", bucket, resp)
		return

	case models.ProfileProviderGcpGcs:
		resp, err := gcsiam.PutBucketIamPolicy(r.Context(), secrets, bucket, req.Policy)
		if err != nil {
			s.writeS3PolicyCallError(w, "put", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		if resp.Status == http.StatusOK {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.writeGenericPolicyUpstreamError(w, "put", bucket, resp.Status, resp.Headers, resp.Body, "gcs")
		return

	case models.ProfileProviderAzureBlob:
		resp, err := azureacl.PutContainerPolicy(r.Context(), secrets, bucket, req.Policy)
		if err != nil {
			s.writeS3PolicyCallError(w, "put", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		if resp.Status == http.StatusOK || resp.Status == http.StatusNoContent {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.writeGenericPolicyUpstreamError(w, "put", bucket, resp.Status, resp.Headers, resp.Body, "azure")
		return

	default:
		writeError(w, http.StatusBadRequest, "bucket_policy_unsupported", "policy is not supported for this provider", map[string]any{"provider": secrets.Provider})
		return
	}
}

func (s *server) handleDeleteBucketPolicy(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		resp, err := s3policy.DeleteBucketPolicy(r.Context(), secrets, bucket)
		if err != nil {
			s.writeS3PolicyCallError(w, "delete", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		switch resp.Status {
		case http.StatusNoContent, http.StatusOK:
			w.WriteHeader(http.StatusNoContent)
			return
		case http.StatusNotFound:
			e := parseXMLError(resp.Body)
			if isNoSuchBucketPolicy(e.Code, e.Message) {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			if isNoSuchBucket(e.Code, e.Message) {
				writeError(w, http.StatusNotFound, string(models.NormalizedErrorNotFound), "bucket not found", map[string]any{"bucket": bucket, "upstreamCode": e.Code})
				return
			}
			s.writeS3PolicyUpstreamError(w, "delete", bucket, resp)
			return
		default:
			s.writeS3PolicyUpstreamError(w, "delete", bucket, resp)
			return
		}

	case models.ProfileProviderGcpGcs:
		writeError(w, http.StatusBadRequest, "bucket_policy_delete_unsupported", "GCS IAM policy cannot be deleted; update it instead", map[string]any{"provider": secrets.Provider})
		return

	case models.ProfileProviderAzureBlob:
		resp, err := azureacl.DeleteContainerPolicy(r.Context(), secrets, bucket)
		if err != nil {
			s.writeS3PolicyCallError(w, "delete", bucket, err)
			return
		}
		if ra := strings.TrimSpace(resp.Headers.Get("Retry-After")); ra != "" {
			w.Header().Set("Retry-After", ra)
		}
		if resp.Status == http.StatusOK || resp.Status == http.StatusNoContent {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.writeGenericPolicyUpstreamError(w, "delete", bucket, resp.Status, resp.Headers, resp.Body, "azure")
		return
	default:
		writeError(w, http.StatusBadRequest, "bucket_policy_unsupported", "policy is not supported for this provider", map[string]any{"provider": secrets.Provider})
		return
	}
}

func (s *server) writeS3PolicyCallError(w http.ResponseWriter, op, bucket string, err error) {
	msg := strings.TrimSpace(err.Error())

	// Classify using the same taxonomy as rclone stderr to keep UX consistent.
	cls := rcloneerrors.Classify(err, msg)
	status, code, ok := rcloneErrorStatus(err, msg)
	if !ok {
		// Heuristics for "local" (preflight) failures where stderr patterns are absent.
		lower := strings.ToLower(msg)
		if strings.Contains(lower, "missing access key") || strings.Contains(lower, "invalid endpoint") || strings.Contains(lower, "unsupported tls mode") {
			status = http.StatusBadRequest
			code = string(rcloneerrors.CodeInvalidConfig)
		} else {
			// Default: treat as network-ish upstream failure (bad gateway).
			status = http.StatusBadGateway
			code = string(cls.Code)
			if strings.TrimSpace(code) == "" {
				code = string(rcloneerrors.CodeUnknown)
			}
		}
	}

	writeError(w, status, code, fmt.Sprintf("failed to %s bucket policy", op), map[string]any{
		"bucket": bucket,
		"error":  msg,
	})
}

func (s *server) writeS3PolicyUpstreamError(w http.ResponseWriter, op, bucket string, resp s3policy.Response) {
	body := strings.TrimSpace(string(resp.Body))
	e := parseXMLError(resp.Body)
	code, msg := e.Code, e.Message
	cls := rcloneerrors.Classify(nil, body)
	status, apiCode, ok := rcloneErrorStatus(nil, body)
	if !ok {
		// Fall back to the upstream status when it's meaningful.
		if resp.Status >= 400 && resp.Status <= 599 {
			status = resp.Status
		} else {
			status = http.StatusBadGateway
		}
		apiCode = string(cls.Code)
		if strings.TrimSpace(apiCode) == "" {
			apiCode = string(rcloneerrors.CodeUnknown)
		}
	}

	details := map[string]any{
		"bucket":        bucket,
		"upstreamCode":  code,
		"upstreamError": msg,
	}
	if reqID := strings.TrimSpace(resp.Headers.Get("x-amz-request-id")); reqID != "" {
		details["upstreamRequestId"] = reqID
	}
	if hostID := strings.TrimSpace(resp.Headers.Get("x-amz-id-2")); hostID != "" {
		details["upstreamHostId"] = hostID
	}
	if details["upstreamRequestId"] == nil && strings.TrimSpace(e.RequestID) != "" {
		details["upstreamRequestId"] = strings.TrimSpace(e.RequestID)
	}
	if details["upstreamHostId"] == nil && strings.TrimSpace(e.HostID) != "" {
		details["upstreamHostId"] = strings.TrimSpace(e.HostID)
	}
	if body != "" && details["upstreamError"] == "" {
		details["upstreamError"] = body
	}

	writeError(w, status, apiCode, fmt.Sprintf("failed to %s bucket policy", op), details)
}

func (s *server) writeGenericPolicyUpstreamError(w http.ResponseWriter, op, bucket string, status int, headers http.Header, body []byte, providerHint string) {
	bodyStr := strings.TrimSpace(string(body))
	cls := rcloneerrors.Classify(nil, bodyStr)
	_, apiCode, ok := rcloneErrorStatus(nil, bodyStr)
	respStatus := status
	if !ok {
		if respStatus >= 400 && respStatus <= 599 {
			// keep upstream
		} else {
			respStatus = http.StatusBadGateway
		}
		apiCode = string(cls.Code)
		if strings.TrimSpace(apiCode) == "" {
			apiCode = string(rcloneerrors.CodeUnknown)
		}
	}

	up := parsedUpstreamError{}
	if providerHint == "gcs" {
		up = parseGCSError(body)
	} else {
		// Azure error responses are XML (same shape as S3), and some S3-compatible endpoints might also reach here.
		up = parseXMLError(body)
	}

	details := map[string]any{
		"bucket":        bucket,
		"upstreamCode":  strings.TrimSpace(up.Code),
		"upstreamError": strings.TrimSpace(up.Message),
	}
	if strings.TrimSpace(up.RequestID) != "" {
		details["upstreamRequestId"] = strings.TrimSpace(up.RequestID)
	}
	if strings.TrimSpace(up.HostID) != "" {
		details["upstreamHostId"] = strings.TrimSpace(up.HostID)
	}

	// Provider-specific request IDs (best effort).
	if reqID := strings.TrimSpace(headers.Get("x-goog-request-id")); reqID != "" {
		details["upstreamRequestId"] = reqID
	}
	if reqID := strings.TrimSpace(headers.Get("x-ms-request-id")); reqID != "" {
		details["upstreamRequestId"] = reqID
	}
	if bodyStr != "" && (details["upstreamError"] == "" || details["upstreamError"] == nil) {
		details["upstreamError"] = bodyStr
	}

	writeError(w, respStatus, apiCode, fmt.Sprintf("failed to %s bucket policy", op), details)
}

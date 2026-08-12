package api

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"

	"s3desk/internal/bucketpolicy"
	"s3desk/internal/rcloneerrors"
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
	newBucketPolicyHTTPService(s).handleGetBucketPolicy(w, r)
}

func (s *server) handlePutBucketPolicy(w http.ResponseWriter, r *http.Request) {
	newBucketPolicyHTTPService(s).handlePutBucketPolicy(w, r)
}

func (s *server) handleDeleteBucketPolicy(w http.ResponseWriter, r *http.Request) {
	newBucketPolicyHTTPService(s).handleDeleteBucketPolicy(w, r)
}

func (s *server) writeS3PolicyCallError(w http.ResponseWriter, op, bucket string, err error) {
	msg := strings.TrimSpace(err.Error())
	cls := rcloneerrors.Classify(err, msg)
	status, code, ok := rcloneErrorStatus(err, msg)
	if !ok {
		lower := strings.ToLower(msg)
		if strings.Contains(lower, "missing access key") || strings.Contains(lower, "invalid endpoint") || strings.Contains(lower, "unsupported tls mode") {
			status = http.StatusBadRequest
			code = string(rcloneerrors.CodeInvalidConfig)
		} else {
			status = http.StatusBadGateway
			code = string(cls.Code)
			if strings.TrimSpace(code) == "" {
				code = string(rcloneerrors.CodeUnknown)
			}
		}
	}

	writeError(w, status, code, fmt.Sprintf("failed to %s bucket policy", op), map[string]any{
		"bucket": bucket,
		"error":  redactRcloneDiagnostic(msg),
	})
}

func (s *server) writeS3PolicyUpstreamError(w http.ResponseWriter, op, bucket string, resp bucketpolicy.Response) {
	body := strings.TrimSpace(string(resp.Body))
	e := parseXMLError(resp.Body)
	code, msg := e.Code, e.Message
	cls := rcloneerrors.Classify(nil, body)
	status, apiCode, ok := rcloneErrorStatus(nil, body)
	if !ok {
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

	writeError(w, status, apiCode, fmt.Sprintf("failed to %s bucket policy", op), redactRcloneDiagnosticDetails(details))
}

func (s *server) writeGenericPolicyUpstreamError(w http.ResponseWriter, op, bucket string, status int, headers http.Header, body []byte, providerHint string) {
	bodyStr := strings.TrimSpace(string(body))
	cls := rcloneerrors.Classify(nil, bodyStr)
	_, apiCode, ok := rcloneErrorStatus(nil, bodyStr)
	respStatus := status
	if !ok {
		if respStatus < 400 || respStatus > 599 {
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
	if reqID := strings.TrimSpace(headers.Get("x-goog-request-id")); reqID != "" {
		details["upstreamRequestId"] = reqID
	}
	if reqID := strings.TrimSpace(headers.Get("x-ms-request-id")); reqID != "" {
		details["upstreamRequestId"] = reqID
	}
	if bodyStr != "" && (details["upstreamError"] == "" || details["upstreamError"] == nil) {
		details["upstreamError"] = bodyStr
	}

	writeError(w, respStatus, apiCode, fmt.Sprintf("failed to %s bucket policy", op), redactRcloneDiagnosticDetails(details))
}

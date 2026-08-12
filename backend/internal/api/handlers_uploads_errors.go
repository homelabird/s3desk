package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type uploadHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

func (e *uploadHTTPError) Error() string {
	return e.message
}

var errUploadIncomplete = errors.New("upload incomplete")

func multipartUploadIDFromCreateResponse(resp *s3.CreateMultipartUploadOutput, err error) (string, *uploadHTTPError) {
	if err != nil {
		return "", newUploadProviderError("failed to create multipart upload", err, nil)
	}
	if resp == nil || resp.UploadId == nil || strings.TrimSpace(*resp.UploadId) == "" {
		return "", &uploadHTTPError{
			status:  http.StatusBadGateway,
			code:    "upload_failed",
			message: "failed to create multipart upload",
			details: map[string]any{"error": "upstream returned an empty uploadId"},
		}
	}
	return strings.TrimSpace(*resp.UploadId), nil
}

func newUploadProviderError(message string, err error, details map[string]any) *uploadHTTPError {
	status, code, ok := rcloneErrorStatus(err, "")
	if !ok {
		status = http.StatusBadGateway
		code = "upload_failed"
	}
	if details == nil {
		details = make(map[string]any, 1)
	}
	details["error"] = err.Error()
	return &uploadHTTPError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func newUploadBadRequestError(message string, details map[string]any) *uploadHTTPError {
	return &uploadHTTPError{
		status:  http.StatusBadRequest,
		code:    "invalid_request",
		message: message,
		details: details,
	}
}

func newUploadNotSupportedError(message string, details map[string]any) *uploadHTTPError {
	return &uploadHTTPError{
		status:  http.StatusBadRequest,
		code:    "not_supported",
		message: message,
		details: details,
	}
}

func newUploadTooLargeError(message string, details map[string]any) *uploadHTTPError {
	return &uploadHTTPError{
		status:  http.StatusRequestEntityTooLarge,
		code:    "too_large",
		message: message,
		details: details,
	}
}

func newUploadInternalError(message string, details map[string]any) *uploadHTTPError {
	return &uploadHTTPError{
		status:  http.StatusInternalServerError,
		code:    "internal_error",
		message: message,
		details: details,
	}
}

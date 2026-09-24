package api

import (
	"context"
	"errors"
	"net"
	"net/http"

	"github.com/aws/smithy-go"

	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/s3client"
)

func (svc objectListHTTPService) executeS3(metric *storageMetric, r *http.Request, p models.ProfileSecrets, bucket, prefix, delimiter, token string, maxKeys int, prefixesOnly bool) (*models.ListObjectsResponse, error) {
	client, err := s3ClientFromProfile(p, svc.server.cfg.AllowRemote, svc.server.metrics)
	if err != nil {
		metric.SetStatus("invalid_config")
		return nil, newObjectListHTTPError(http.StatusBadRequest, "invalid_config", "failed to prepare S3 listing client", nil)
	}
	// Preserve the existing API's directory semantics (docs and docs/ are equal).
	q := objectlisting.Query{ProfileID: p.ID, Bucket: bucket, Prefix: rcloneconfig.NormalizePrefix(prefix, p.PreserveLeadingSlash), Delimiter: delimiter, Token: token, MaxKeys: maxKeys, PrefixesOnly: prefixesOnly}
	result, err := objectlisting.List(r.Context(), q, metric.TrackObjectListPages(string(p.Provider), s3client.ListPage(client)))
	if err != nil {
		metric.SetStatus("remote_error")
		return nil, s3ListHTTPError(err)
	}
	result.Prefix = prefix // response continues to echo the caller's prefix
	metric.SetStatus("success")
	return result, nil
}

func s3ListHTTPError(err error) *objectListHTTPError {
	status, code, message := http.StatusBadGateway, "s3_error", "failed to list objects"
	if errors.Is(err, objectlisting.ErrInvalidToken) {
		status, code, message = http.StatusBadRequest, "invalid_request", "invalid continuation token; refresh the listing"
	} else if errors.Is(err, context.Canceled) {
		status, code, message = http.StatusRequestTimeout, "canceled", "object listing canceled"
	} else if errors.Is(err, context.DeadlineExceeded) {
		status, code, message = http.StatusGatewayTimeout, "upstream_timeout", "object listing timed out"
	}
	var timeout net.Error
	if errors.As(err, &timeout) && timeout.Timeout() {
		status, code = http.StatusGatewayTimeout, "upstream_timeout"
	}
	var upstream smithy.APIError
	if errors.As(err, &upstream) {
		switch upstream.ErrorCode() {
		case "AccessDenied", "AllAccessDisabled":
			status, code = http.StatusForbidden, "access_denied"
		case "SignatureDoesNotMatch":
			status, code = http.StatusForbidden, "signature_mismatch"
		case "RequestTimeTooSkewed":
			status, code = http.StatusBadRequest, "request_time_skewed"
		case "InvalidAccessKeyId", "ExpiredToken", "InvalidToken":
			status, code = http.StatusForbidden, "invalid_credentials"
		case "NoSuchBucket", "NotFound":
			status, code = http.StatusNotFound, "not_found"
		case "SlowDown", "Throttling", "TooManyRequests":
			status, code = http.StatusTooManyRequests, "rate_limited"
		case "InvalidArgument", "InvalidRequest":
			status, code = http.StatusBadRequest, "invalid_request"
		}
	}
	// Never expose raw provider error messages or signed request URLs.
	return newObjectListHTTPError(status, code, message, nil)
}

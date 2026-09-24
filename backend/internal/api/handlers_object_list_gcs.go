package api

import (
	"context"
	"errors"
	"net"
	"net/http"

	"s3desk/internal/gcsbucket"
	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
	"s3desk/internal/rcloneconfig"
)

func (svc objectListHTTPService) executeGCS(metric *storageMetric, r *http.Request, p models.ProfileSecrets, bucket, prefix, delimiter, token string, maxKeys int, prefixesOnly bool) (*models.ListObjectsResponse, error) {
	clientOpts := gcsbucket.ClientOptions{AllowRemote: svc.server.cfg.AllowRemote}
	q := objectlisting.Query{
		Provider: "gcs", TokenPrefix: objectlisting.GCSTokenPrefix, ProfileID: p.ID,
		Bucket: bucket, Prefix: rcloneconfig.NormalizePrefix(prefix, p.PreserveLeadingSlash),
		Delimiter: delimiter, Token: token, MaxKeys: maxKeys, PrefixesOnly: prefixesOnly,
	}
	fetch := func(ctx context.Context, req objectlisting.Request) (objectlisting.Page, error) {
		page, err := gcsbucket.ListObjectsPage(ctx, p, req, clientOpts)
		if err != nil {
			return objectlisting.Page{}, err
		}
		return page, nil
	}
	result, err := objectlisting.List(r.Context(), q, metric.TrackObjectListPages(string(p.Provider), fetch))
	if err != nil {
		metric.SetStatus("remote_error")
		return nil, gcsListHTTPError(err)
	}
	result.Prefix = prefix
	metric.SetStatus("success")
	return result, nil
}

func gcsListHTTPError(err error) *objectListHTTPError {
	status, code, message := http.StatusBadGateway, "gcs_error", "failed to list objects"
	if errors.Is(err, objectlisting.ErrInvalidToken) {
		status, code, message = http.StatusBadRequest, "invalid_request", "invalid continuation token; refresh the listing"
	} else if errors.Is(err, objectlisting.ErrInvalidPage) {
		status, code, message = http.StatusBadGateway, "invalid_response", "storage provider returned an invalid listing response"
	} else if errors.Is(err, context.Canceled) {
		status, code, message = http.StatusRequestTimeout, "canceled", "object listing canceled"
	} else if errors.Is(err, context.DeadlineExceeded) {
		status, code, message = http.StatusGatewayTimeout, "upstream_timeout", "object listing timed out"
	}
	var timeout net.Error
	if errors.As(err, &timeout) && timeout.Timeout() {
		status, code = http.StatusGatewayTimeout, "upstream_timeout"
	}
	var upstream *gcsbucket.HTTPStatusError
	if errors.As(err, &upstream) {
		switch upstream.StatusCode {
		case http.StatusBadRequest:
			status, code = http.StatusBadRequest, "invalid_request"
		case http.StatusUnauthorized:
			status, code = http.StatusForbidden, "invalid_credentials"
		case http.StatusForbidden:
			status, code = http.StatusForbidden, "access_denied"
		case http.StatusNotFound:
			status, code = http.StatusNotFound, "not_found"
		case http.StatusTooManyRequests:
			status, code = http.StatusTooManyRequests, "rate_limited"
		}
	}
	return newObjectListHTTPError(status, code, message, nil)
}

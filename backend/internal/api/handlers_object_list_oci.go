package api

import (
	"context"
	"errors"
	"net"
	"net/http"

	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
	"s3desk/internal/ocicli"
	"s3desk/internal/rcloneconfig"
)

func (svc objectListHTTPService) executeOCI(metric *storageMetric, r *http.Request, p models.ProfileSecrets, bucket, prefix, delimiter, token string, maxKeys int, prefixesOnly bool) (*models.ListObjectsResponse, error) {
	q := objectlisting.Query{
		Provider: "oci", TokenPrefix: objectlisting.OCITokenPrefix, ProfileID: p.ID,
		Bucket: bucket, Prefix: rcloneconfig.NormalizePrefix(prefix, p.PreserveLeadingSlash),
		Delimiter: delimiter, Token: token, MaxKeys: maxKeys, PrefixesOnly: prefixesOnly,
	}
	fetch := func(ctx context.Context, req objectlisting.Request) (objectlisting.Page, error) {
		return ocicli.ListObjectsPage(ctx, p, bucket, req, ocicli.ClientOptions{AllowRemote: svc.server.cfg.AllowRemote})
	}
	result, err := objectlisting.List(r.Context(), q, metric.TrackObjectListPages(string(p.Provider), fetch))
	if err != nil {
		metric.SetStatus("remote_error")
		return nil, ociListHTTPError(err)
	}
	result.Prefix = prefix
	metric.SetStatus("success")
	return result, nil
}

func ociListHTTPError(err error) *objectListHTTPError {
	status, code, message := http.StatusBadGateway, "oci_error", "failed to list objects"
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
	return newObjectListHTTPError(status, code, message, nil)
}

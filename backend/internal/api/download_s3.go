package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"

	"s3desk/internal/models"
	"s3desk/internal/objectdownload"
	"s3desk/internal/rcloneconfig"
)

type s3DownloadClient interface {
	HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
	GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error)
}
type s3DownloadSource struct {
	client      s3DownloadClient
	bucket, key string
}

func stringValue(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
func downloadSize(v *int64) int64 {
	if v == nil {
		return -1
	}
	return *v
}
func downloadTime(v *time.Time) time.Time {
	if v == nil {
		return time.Time{}
	}
	return *v
}
func (s s3DownloadSource) Head(ctx context.Context) (objectdownload.Metadata, error) {
	o, e := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: &s.bucket, Key: &s.key})
	if e != nil {
		return objectdownload.Metadata{}, downloadS3Error(e)
	}
	return objectdownload.Metadata{Size: downloadSize(o.ContentLength), ETag: stringValue(o.ETag), VersionID: stringValue(o.VersionId), ContentType: stringValue(o.ContentType), LastModified: downloadTime(o.LastModified)}, nil
}
func (s s3DownloadSource) Get(ctx context.Context, q objectdownload.ReadRequest) (objectdownload.Response, error) {
	in := &s3.GetObjectInput{Bucket: &s.bucket, Key: &s.key}
	if q.Range != "" {
		in.Range = &q.Range
	}
	if q.IfMatch != "" {
		in.IfMatch = &q.IfMatch
	}
	if q.VersionID != "" {
		in.VersionId = &q.VersionID
	}
	o, e := s.client.GetObject(ctx, in)
	if e != nil {
		return objectdownload.Response{}, downloadS3Error(e)
	}
	return objectdownload.Response{Metadata: objectdownload.Metadata{Size: downloadSize(o.ContentLength), ETag: stringValue(o.ETag), VersionID: stringValue(o.VersionId), ContentType: stringValue(o.ContentType), LastModified: downloadTime(o.LastModified)}, Body: o.Body, ContentRange: stringValue(o.ContentRange)}, nil
}
func downloadS3Error(err error) error {
	status := http.StatusBadGateway
	// HEAD failures may have no XML error code. Preserve the HTTP status from
	// wrapped SDK transport errors rather than reporting a permission/missing
	// object as a server outage.
	var transportError interface{ HTTPStatusCode() int }
	if errors.As(err, &transportError) {
		switch transportError.HTTPStatusCode() {
		case 400, 403, 404, 405, 412, 416, 429, 503, 504:
			status = transportError.HTTPStatusCode()
		}
	}
	var ae smithy.APIError
	if errors.As(err, &ae) {
		switch ae.ErrorCode() {
		case "NoSuchKey", "NoSuchBucket", "NoSuchVersion", "NotFound":
			status = http.StatusNotFound
		case "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "ExpiredToken":
			status = http.StatusForbidden
		case "PreconditionFailed":
			status = http.StatusPreconditionFailed
		case "InvalidRange", "RequestedRangeNotSatisfiable":
			status = http.StatusRequestedRangeNotSatisfiable
		case "SlowDown", "Throttling", "TooManyRequests":
			status = http.StatusTooManyRequests
		}
	}
	if errors.Is(err, context.DeadlineExceeded) {
		status = http.StatusGatewayTimeout
	}
	return &objectdownload.HTTPError{Status: status}
}
func (s *server) serveS3Download(w http.ResponseWriter, r *http.Request, secrets models.ProfileSecrets, bucket, key string) {
	client, err := s3ClientFromProfile(secrets, s.cfg.AllowRemote)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_config", "failed to prepare S3 download", nil)
		return
	}
	// Reuse the guarded profile transport; never use the browser endpoint for
	// server requests and never fall back around provider permission failures.
	src := s3DownloadSource{client: client, bucket: bucket, key: rcloneconfig.NormalizePathInput(key, secrets.PreserveLeadingSlash)}
	objectdownload.Serve(w, r, src, key)
}

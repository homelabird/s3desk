package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"s3desk/internal/objectdownload"
)

type recordingDownloadSDK struct{ get *s3.GetObjectInput }

func (*recordingDownloadSDK) HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	size := int64(8)
	etag := `"etag1"`
	version := "version1"
	return &s3.HeadObjectOutput{ContentLength: &size, ETag: &etag, VersionId: &version}, nil
}
func (c *recordingDownloadSDK) GetObject(_ context.Context, in *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	c.get = in
	size := int64(4)
	etag := `"etag1"`
	version := "version1"
	span := "bytes 4-7/8"
	return &s3.GetObjectOutput{ContentLength: &size, ETag: &etag, VersionId: &version, ContentRange: &span, Body: io.NopCloser(strings.NewReader("4567"))}, nil
}
func TestDownloadSDKAdapterPreservesReadConditions(t *testing.T) {
	client := &recordingDownloadSDK{}
	src := s3DownloadSource{client: client, bucket: "bucket", key: "folder/file"}
	meta, err := src.Head(context.Background())
	if err != nil || meta.Size != 8 {
		t.Fatalf("head %v %v", meta, err)
	}
	response, err := src.Get(context.Background(), objectdownload.ReadRequest{Range: "bytes=4-7", IfMatch: meta.ETag, VersionID: meta.VersionID})
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if stringValue(client.get.Range) != "bytes=4-7" || stringValue(client.get.IfMatch) != meta.ETag || stringValue(client.get.VersionId) != meta.VersionID || stringValue(client.get.Key) != "folder/file" {
		t.Fatalf("wrong S3 conditions: %+v", client.get)
	}
	if response.Size != 4 || response.ContentRange != "bytes 4-7/8" || response.ETag != meta.ETag {
		t.Fatalf("wrong metadata %+v", response)
	}
}
func TestDownloadSDKErrorStatus(t *testing.T) {
	for code, want := range map[string]int{"NoSuchKey": 404, "AccessDenied": 403, "PreconditionFailed": 412, "InvalidRange": 416, "SlowDown": 429, "unexpected": http.StatusBadGateway} {
		err := downloadS3Error(&smithy.GenericAPIError{Code: code, Message: "must not be returned to a downloader"})
		e, ok := err.(*objectdownload.HTTPError)
		if !ok || e.Status != want || strings.Contains(e.Error(), "must not") {
			t.Fatalf("code %s: %v", code, err)
		}
	}
}

// Mirrors the transport status interface implemented by wrapped SDK errors.
type downloadTransportFailure struct{ status int }

func (e downloadTransportFailure) Error() string       { return "sensitive provider diagnostic" }
func (e downloadTransportFailure) HTTPStatusCode() int { return e.status }
func TestDownloadSDKHeadStatusWithoutXML(t *testing.T) {
	for _, status := range []int{400, 403, 404, 405, 412, 416, 429, 503, 504} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			err := downloadS3Error(fmt.Errorf("wrapped: %w", downloadTransportFailure{status: status}))
			got, ok := err.(*objectdownload.HTTPError)
			if !ok || got.Status != status || strings.Contains(got.Error(), "sensitive") {
				t.Fatalf("got %v", err)
			}
		})
	}
}

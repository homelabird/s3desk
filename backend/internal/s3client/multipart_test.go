package s3client

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
)

func TestMultipartHelpersUseSharedSDKShapes(t *testing.T) {
	var requests []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			if r.URL.Query().Has("uploads") {
				requests = append(requests, "create:"+r.Header.Get("Content-Type"))
				_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>`)
				return
			}
			if r.URL.Query().Get("uploadId") != "" {
				requests = append(requests, "complete")
				_, _ = io.WriteString(w, `<CompleteMultipartUploadResult/>`)
				return
			}
		case http.MethodDelete:
			if r.URL.Query().Get("uploadId") != "" {
				requests = append(requests, "abort")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		http.Error(w, "unexpected request", http.StatusBadRequest)
	}))
	t.Cleanup(srv.Close)

	client, err := FromProfileWithOptions(models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        srv.URL,
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
		ForcePathStyle:  true,
	}, ProfileOptions{})
	if err != nil {
		t.Fatalf("FromProfileWithOptions: %v", err)
	}

	ctx := context.Background()
	resp, err := CreateMultipartUpload(ctx, client, "bucket", "file.bin", " text/plain ")
	if err != nil {
		t.Fatalf("CreateMultipartUpload: %v", err)
	}
	if resp == nil || resp.UploadId == nil || *resp.UploadId != "upload-1" {
		t.Fatalf("create response=%+v, want upload-1", resp)
	}

	partNumber := int32(1)
	etag := `"etag-1"`
	if err := CompleteMultipartUpload(ctx, client, "bucket", "file.bin", "upload-1", []types.CompletedPart{{PartNumber: &partNumber, ETag: &etag}}); err != nil {
		t.Fatalf("CompleteMultipartUpload: %v", err)
	}
	if err := AbortMultipartUpload(ctx, client, "bucket", "file.bin", "upload-1"); err != nil {
		t.Fatalf("AbortMultipartUpload: %v", err)
	}

	want := []string{"create:text/plain", "complete", "abort"}
	if !reflect.DeepEqual(requests, want) {
		t.Fatalf("requests=%v, want %v", requests, want)
	}
	if !strings.Contains(requests[0], "text/plain") {
		t.Fatalf("create request=%q, want content type", requests[0])
	}
}

func TestAbortMultipartUploadTreatsNoSuchUploadAsAlreadyGone(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `<Error><Code>NoSuchUpload</Code><Message>upload is already gone</Message></Error>`)
	}))
	t.Cleanup(srv.Close)

	client, err := FromProfileWithOptions(models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        srv.URL,
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
		ForcePathStyle:  true,
	}, ProfileOptions{})
	if err != nil {
		t.Fatalf("FromProfileWithOptions: %v", err)
	}

	if err := AbortMultipartUpload(context.Background(), client, "bucket", "file.bin", "gone"); err != nil {
		t.Fatalf("AbortMultipartUpload: %v, want already-gone success", err)
	}
}

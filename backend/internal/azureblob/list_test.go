package azureblob

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
)

func TestListBlobsPageMapsAndResumesNextMarker(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/acct/container" || r.URL.Query().Get("restype") != "container" || r.URL.Query().Get("comp") != "list" || r.URL.Query().Get("maxresults") != "2" || r.URL.Query().Get("prefix") != "docs/" || r.URL.Query().Get("delimiter") != "/" {
			t.Errorf("request=%s", r.URL)
		}
		if !strings.HasPrefix(r.Header.Get("Authorization"), "SharedKey acct:") || r.Header.Get("x-ms-version") == "" {
			t.Errorf("headers=%v", r.Header)
		}
		if calls == 1 {
			if r.URL.Query().Get("marker") != "" {
				t.Errorf("first marker=%q", r.URL.Query().Get("marker"))
			}
			_, _ = io.WriteString(w, `<EnumerationResults><Blobs><Blob><Name>docs/a.txt</Name><Properties><Content-Length>7</Content-Length><Etag>"tag"</Etag><Last-Modified>Tue, 01 Sep 2026 12:00:00 GMT</Last-Modified></Properties></Blob><BlobPrefix><Name>docs/sub/</Name></BlobPrefix></Blobs><NextMarker>opaque+/=marker</NextMarker></EnumerationResults>`)
			return
		}
		if got := r.URL.Query().Get("marker"); got != "opaque+/=marker" {
			t.Errorf("marker=%q", got)
		}
		_, _ = io.WriteString(w, `<EnumerationResults><Blobs><Blob><Name>docs/b.txt</Name><Properties><Content-Length>0</Content-Length></Properties></Blob></Blobs><NextMarker></NextMarker></EnumerationResults>`)
	}))
	defer server.Close()
	profile := models.ProfileSecrets{AzureAccountName: "acct", AzureAccountKey: base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")), AzureEndpoint: server.URL + "/acct"}
	req := objectlisting.Request{Bucket: "container", Prefix: "docs/", Delimiter: "/", MaxKeys: 2}
	first, err := ListBlobsPage(context.Background(), profile, req, false)
	if err != nil || !first.IsTruncated || first.NextToken != "opaque+/=marker" || len(first.Items) != 1 || len(first.CommonPrefixes) != 1 || first.Items[0].Size != 7 || first.Items[0].LastModified != "2026-09-01T12:00:00Z" {
		t.Fatalf("first=%+v err=%v", first, err)
	}
	req.ContinuationToken = first.NextToken
	second, err := ListBlobsPage(context.Background(), profile, req, false)
	if err != nil || second.IsTruncated || len(second.Items) != 1 || second.Items[0].Size != 0 || calls != 2 {
		t.Fatalf("second=%+v calls=%d err=%v", second, calls, err)
	}
}

func TestListBlobsPageRejectsInvalidXMLAndHidesProviderErrors(t *testing.T) {
	for _, body := range []string{"not-xml", `<EnumerationResults><Blobs><Blob><Name>bad</Name><Properties><Content-Length>NaN</Content-Length></Properties></Blob></Blobs></EnumerationResults>`} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, body) }))
		profile := models.ProfileSecrets{AzureAccountName: "acct", AzureAccountKey: base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")), AzureEndpoint: server.URL}
		_, err := ListBlobsPage(context.Background(), profile, objectlisting.Request{Bucket: "container", MaxKeys: 1}, false)
		server.Close()
		if !errors.Is(err, objectlisting.ErrInvalidPage) {
			t.Fatalf("body=%q err=%v", body, err)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "private-account-key-detail", http.StatusForbidden)
	}))
	defer server.Close()
	profile := models.ProfileSecrets{AzureAccountName: "acct", AzureAccountKey: base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")), AzureEndpoint: server.URL}
	_, err := ListBlobsPage(context.Background(), profile, objectlisting.Request{Bucket: "container", MaxKeys: 1}, false)
	var statusErr *HTTPStatusError
	if !errors.As(err, &statusErr) || statusErr.StatusCode != http.StatusForbidden || strings.Contains(err.Error(), "private-account-key-detail") {
		t.Fatalf("err=%v", err)
	}
}

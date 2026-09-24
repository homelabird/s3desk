package api

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/metrics"
	"s3desk/internal/models"
)

func TestNativeS3ListUsesProviderCursorAndNoRclone(t *testing.T) {
	var calls atomic.Int32
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/bucket" || r.URL.Query().Get("list-type") != "2" || r.URL.Query().Get("max-keys") != "1" {
			t.Errorf("wrong S3 request: %s", r.URL)
		}
		w.Header().Set("Content-Type", "application/xml")
		if r.URL.Query().Get("continuation-token") == "" {
			io.WriteString(w, `<ListBucketResult><EncodingType>url</EncodingType><IsTruncated>true</IsTruncated><NextContinuationToken>opaque/+==</NextContinuationToken><Contents><Key>a%2Bb%20%ED%95%9C%EA%B8%80</Key><Size>2</Size><LastModified>2026-09-20T00:00:00Z</LastModified></Contents></ListBucketResult>`)
			return
		}
		if r.URL.Query().Get("continuation-token") != "opaque/+==" {
			t.Errorf("cursor=%q", r.URL.Query().Get("continuation-token"))
		}
		io.WriteString(w, `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>final.txt</Key><Size>3</Size></Contents></ListBucketResult>`)
	}))
	defer storage.Close()
	srv := &server{cfg: config.Config{S3NativeList: true, DataDir: t.TempDir()}}
	p := models.ProfileSecrets{ID: "profile", Provider: models.ProfileProviderS3Compatible, Endpoint: storage.URL, ForcePathStyle: true, AccessKeyID: "test", SecretAccessKey: "test-secret"}
	token := ""
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/bucket/objects?maxKeys=1&continuationToken="+url.QueryEscape(token), nil)
		req = withProfileSecrets(withBucketParam(req, "bucket"), p)
		rr := httptest.NewRecorder()
		srv.handleListObjects(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
		}
		var out models.ListObjectsResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if len(out.Items) != 1 {
			t.Fatal(out)
		}
		if i == 0 {
			if out.Items[0].Key != "a+b 한글" || out.NextContinuationToken == nil {
				t.Fatal(out)
			}
			token = *out.NextContinuationToken
		} else if out.IsTruncated || out.Items[0].Key != "final.txt" {
			t.Fatal(out)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("made %d provider calls, want 2", calls.Load())
	}
}

func TestNativeS3RecursiveListUsesProviderCursor(t *testing.T) {
	var calls atomic.Int32
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Query().Has("delimiter") {
			t.Errorf("recursive request unexpectedly set delimiter: %s", r.URL)
		}
		w.Header().Set("Content-Type", "application/xml")
		if r.URL.Query().Get("continuation-token") == "" {
			io.WriteString(w, `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>recursive-next</NextContinuationToken><Contents><Key>folder/a.txt</Key><Size>2</Size></Contents></ListBucketResult>`)
			return
		}
		if r.URL.Query().Get("continuation-token") != "recursive-next" {
			t.Errorf("cursor=%q", r.URL.Query().Get("continuation-token"))
		}
		io.WriteString(w, `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>folder/b.txt</Key><Size>3</Size></Contents></ListBucketResult>`)
	}))
	defer storage.Close()
	srv := &server{cfg: config.Config{S3NativeList: true, DataDir: t.TempDir()}}
	p := models.ProfileSecrets{ID: "profile", Provider: models.ProfileProviderS3Compatible, Endpoint: storage.URL, ForcePathStyle: true, AccessKeyID: "test", SecretAccessKey: "test-secret"}
	token := ""
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/bucket/objects?delimiter=&maxKeys=1&continuationToken="+url.QueryEscape(token), nil)
		req = withProfileSecrets(withBucketParam(req, "bucket"), p)
		rr := httptest.NewRecorder()
		srv.handleListObjects(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
		}
		var out models.ListObjectsResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if len(out.Items) != 1 {
			t.Fatalf("response=%+v", out)
		}
		if i == 0 {
			if out.Items[0].Key != "folder/a.txt" || out.NextContinuationToken == nil {
				t.Fatalf("first response=%+v", out)
			}
			token = *out.NextContinuationToken
		} else if out.IsTruncated || out.Items[0].Key != "folder/b.txt" {
			t.Fatalf("second response=%+v", out)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("made %d provider calls, want 2", calls.Load())
	}
}

func TestNativeS3ListDoesNotExposeProviderSecrets(t *testing.T) {
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(403)
		io.WriteString(w, `<Error><Code>AccessDenied</Code><Message>secret_access_key=must-not-leak</Message></Error>`)
	}))
	defer storage.Close()
	srv := &server{cfg: config.Config{S3NativeList: true}}
	p := models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible, Endpoint: storage.URL, ForcePathStyle: true, AccessKeyID: "test", SecretAccessKey: "test"}
	req := withProfileSecrets(withBucketParam(httptest.NewRequest("GET", "/objects", nil), "bucket"), p)
	rr := httptest.NewRecorder()
	srv.handleListObjects(rr, req)
	if rr.Code != 403 || strings.Contains(rr.Body.String(), "must-not-leak") {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestNativeGCSListUsesProviderCursorAndNoRclone(t *testing.T) {
	var calls atomic.Int32
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/storage/v1/b/bucket/o" || r.URL.Query().Get("maxResults") != "1" || r.URL.Query().Get("prefix") != "docs/" {
			t.Errorf("wrong GCS request: %s", r.URL)
		}
		if r.URL.Query().Get("delimiter") != "/" {
			t.Errorf("delimiter=%q", r.URL.Query().Get("delimiter"))
		}
		if r.URL.Query().Get("pageToken") == "" {
			io.WriteString(w, `{"nextPageToken":"opaque/+==","items":[{"name":"docs/a.txt","size":"2"}]}`)
			return
		}
		if r.URL.Query().Get("pageToken") != "opaque/+==" {
			t.Errorf("pageToken=%q", r.URL.Query().Get("pageToken"))
		}
		io.WriteString(w, `{"items":[{"name":"docs/b.txt","size":"3"}]}`)
	}))
	defer storage.Close()
	srv := &server{cfg: config.Config{GCSNativeList: true, DataDir: t.TempDir()}}
	p := models.ProfileSecrets{ID: "profile", Provider: models.ProfileProviderGcpGcs, GcpEndpoint: storage.URL, GcpAnonymous: true}
	token := ""
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/bucket/objects?prefix=docs%2F&maxKeys=1&continuationToken="+url.QueryEscape(token), nil)
		req = withProfileSecrets(withBucketParam(req, "bucket"), p)
		rr := httptest.NewRecorder()
		srv.handleListObjects(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
		}
		var out models.ListObjectsResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if len(out.Items) != 1 {
			t.Fatalf("response=%+v", out)
		}
		if i == 0 {
			if out.Items[0].Key != "docs/a.txt" || out.NextContinuationToken == nil || !strings.HasPrefix(*out.NextContinuationToken, "gcsv1.") {
				t.Fatalf("first response=%+v", out)
			}
			token = *out.NextContinuationToken
		} else if out.IsTruncated || out.Items[0].Key != "docs/b.txt" {
			t.Fatalf("second response=%+v", out)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("made %d provider calls, want 2", calls.Load())
	}
}

func TestNativeAzureListUsesProviderMarkerAndNoRclone(t *testing.T) {
	var calls atomic.Int32
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/acct/container" || r.URL.Query().Get("comp") != "list" || r.URL.Query().Get("prefix") != "docs/" || r.URL.Query().Get("maxresults") != "1" {
			t.Errorf("wrong Azure request: %s", r.URL)
		}
		if !strings.HasPrefix(r.Header.Get("Authorization"), "SharedKey acct:") {
			t.Errorf("authorization=%q", r.Header.Get("Authorization"))
		}
		if r.URL.Query().Get("marker") == "" {
			io.WriteString(w, `<EnumerationResults><Blobs><Blob><Name>docs/a.txt</Name><Properties><Content-Length>2</Content-Length></Properties></Blob></Blobs><NextMarker>opaque+/=</NextMarker></EnumerationResults>`)
			return
		}
		if r.URL.Query().Get("marker") != "opaque+/=" {
			t.Errorf("marker=%q", r.URL.Query().Get("marker"))
		}
		io.WriteString(w, `<EnumerationResults><Blobs><Blob><Name>docs/b.txt</Name><Properties><Content-Length>3</Content-Length></Properties></Blob></Blobs><NextMarker></NextMarker></EnumerationResults>`)
	}))
	defer storage.Close()
	srv := &server{cfg: config.Config{AzureNativeList: true, DataDir: t.TempDir()}}
	p := models.ProfileSecrets{ID: "profile", Provider: models.ProfileProviderAzureBlob, AzureAccountName: "acct", AzureAccountKey: base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")), AzureEndpoint: storage.URL + "/acct"}
	token := ""
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/container/objects?prefix=docs%2F&maxKeys=1&continuationToken="+url.QueryEscape(token), nil)
		req = withProfileSecrets(withBucketParam(req, "container"), p)
		rr := httptest.NewRecorder()
		srv.handleListObjects(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
		}
		var out models.ListObjectsResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if len(out.Items) != 1 {
			t.Fatalf("response=%+v", out)
		}
		if i == 0 {
			if out.Items[0].Key != "docs/a.txt" || out.NextContinuationToken == nil || !strings.HasPrefix(*out.NextContinuationToken, "azv1.") {
				t.Fatalf("first response=%+v", out)
			}
			token = *out.NextContinuationToken
		} else if out.IsTruncated || out.Items[0].Key != "docs/b.txt" {
			t.Fatalf("second response=%+v", out)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("made %d provider calls, want 2", calls.Load())
	}
}

func TestNativeOCIListUsesStartCursorAndNoAllPagesCLI(t *testing.T) {
	dir := t.TempDir()
	cli := filepath.Join(dir, "oci")
	calls := filepath.Join(dir, "calls")
	script := `#!/bin/sh
want_start=0
start=''
for arg in "$@"; do
  if [ "$want_start" = 1 ]; then start="$arg"; want_start=0; continue; fi
  if [ "$arg" = "--start" ]; then want_start=1; fi
done
printf x >> "$OCI_TEST_CALLS"
if [ -n "$start" ]; then
  printf '%s\n' '{"data":[{"name":"docs/b.txt","size":3,"etag":"e2","time-modified":"2026-09-02T12:00:00+00:00","storage-tier":"Standard"}],"prefixes":[]}'
else
  printf '%s\n' '{"data":[{"name":"docs/a.txt","size":2,"etag":"e1","time-modified":"2026-09-01T12:00:00+00:00","storage-tier":"Standard"}],"prefixes":[],"next-start-with":"opaque/+=="}'
fi
`
	if err := os.WriteFile(cli, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(cli, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OCI_CLI_PATH", cli)
	t.Setenv("OCI_TEST_CALLS", calls)
	srv := &server{cfg: config.Config{OCINativeList: true, DataDir: t.TempDir()}, metrics: metrics.New()}
	p := models.ProfileSecrets{ID: "profile", Provider: models.ProfileProviderOciObjectStorage, OciNamespace: "namespace"}
	token := ""
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/bucket/objects?prefix=docs%2F&maxKeys=1&continuationToken="+url.QueryEscape(token), nil)
		req = withProfileSecrets(withBucketParam(req, "bucket"), p)
		rr := httptest.NewRecorder()
		srv.handleListObjects(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
		}
		var out models.ListObjectsResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if len(out.Items) != 1 {
			t.Fatalf("response=%+v", out)
		}
		if i == 0 {
			if out.Items[0].Key != "docs/a.txt" || out.NextContinuationToken == nil || !strings.HasPrefix(*out.NextContinuationToken, "ociv1.") {
				t.Fatalf("first response=%+v", out)
			}
			token = *out.NextContinuationToken
		} else if out.IsTruncated || out.Items[0].Key != "docs/b.txt" {
			t.Fatalf("second response=%+v", out)
		}
	}
	callLog, err := os.ReadFile(calls)
	if err != nil || string(callLog) != "xx" {
		t.Fatalf("calls=%q err=%v", callLog, err)
	}
	metricResponse := httptest.NewRecorder()
	srv.metrics.Handler().ServeHTTP(metricResponse, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if !strings.Contains(metricResponse.Body.String(), `storage_list_page_requests_total{provider="oci_object_storage",status="success"} 2`) {
		t.Fatalf("page request metric missing or inaccurate: %s", metricResponse.Body.String())
	}
}

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"s3desk/internal/config"
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
			fmt.Fprint(w, `<ListBucketResult><EncodingType>url</EncodingType><IsTruncated>true</IsTruncated><NextContinuationToken>opaque/+==</NextContinuationToken><Contents><Key>a%2Bb%20%ED%95%9C%EA%B8%80</Key><Size>2</Size><LastModified>2026-09-20T00:00:00Z</LastModified></Contents></ListBucketResult>`)
			return
		}
		if r.URL.Query().Get("continuation-token") != "opaque/+==" {
			t.Errorf("cursor=%q", r.URL.Query().Get("continuation-token"))
		}
		fmt.Fprint(w, `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>final.txt</Key><Size>3</Size></Contents></ListBucketResult>`)
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
func TestNativeS3ListDoesNotExposeProviderSecrets(t *testing.T) {
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(403)
		fmt.Fprint(w, `<Error><Code>AccessDenied</Code><Message>secret_access_key=must-not-leak</Message></Error>`)
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

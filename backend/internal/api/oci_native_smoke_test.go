package api

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

const (
	ociNativeSmokeRegion      = "us-phoenix-1"
	ociNativeSmokeNamespace   = "my-namespace"
	ociNativeSmokeCompartment = "ocid1.compartment.oc1..aaaaexampleuniqueID"
	ociNativeSmokeEndpoint    = "https://objectstorage.us-phoenix-1.oraclecloud.com"
)

func TestHandleListBucketsOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets", nil)
	req = withProfileSecrets(req, ociNativeSmokeProfileSecrets())
	rr := httptest.NewRecorder()

	srv.handleListBuckets(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var buckets []models.Bucket
	decodeJSONResponse(t, res, &buckets)
	if len(buckets) != 1 || buckets[0].Name != "oci-native-bucket" {
		t.Fatalf("buckets=%+v, want one OCI native bucket", buckets)
	}
}

func TestHandleCreateBucketOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets", bytes.NewReader([]byte(`{"name":"demo"}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, ociNativeSmokeProfileSecrets())
	rr := httptest.NewRecorder()

	srv.handleCreateBucket(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusCreated)
	}

	var bucket models.Bucket
	decodeJSONResponse(t, res, &bucket)
	if bucket.Name != "demo" {
		t.Fatalf("bucket=%+v, want name demo", bucket)
	}
}

func TestHandleDeleteBucketOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/demo", nil)
	req = withProfileSecrets(req, ociNativeSmokeProfileSecrets())
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleDeleteBucket(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
}

func TestHandleTestProfileOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/test", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ProfileTestResponse
	decodeJSONResponse(t, res, &resp)
	if !resp.OK || resp.Message != "ok" {
		t.Fatalf("response=%+v, want ok test result", resp)
	}
	if got := resp.Details["provider"]; got != string(models.ProfileProviderOciObjectStorage) {
		t.Fatalf("provider=%v, want %q", got, models.ProfileProviderOciObjectStorage)
	}
	if got, ok := resp.Details["buckets"].(float64); !ok || got != 1 {
		t.Fatalf("buckets=%v, want 1", resp.Details["buckets"])
	}
}

func TestHandleBenchmarkProfileOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/benchmark", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ProfileBenchmarkResponse
	decodeJSONResponse(t, res, &resp)
	if !resp.OK || resp.Message != "ok" || !resp.CleanedUp {
		t.Fatalf("response=%+v, want successful benchmark", resp)
	}
	if got := resp.Details["provider"]; got != string(models.ProfileProviderOciObjectStorage) {
		t.Fatalf("provider=%v, want %q", got, models.ProfileProviderOciObjectStorage)
	}
}

func TestHandleListObjectsOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/oci-native-bucket/objects", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ListObjectsResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Bucket != "oci-native-bucket" {
		t.Fatalf("bucket=%q, want oci-native-bucket", resp.Bucket)
	}
	if len(resp.Items) != 1 || resp.Items[0].Key != "report.txt" {
		t.Fatalf("items=%+v, want one object report.txt", resp.Items)
	}
}

func TestHandleGetObjectMetaOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/oci-native-bucket/objects/meta?key=report.txt", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ObjectMeta
	decodeJSONResponse(t, res, &resp)
	if resp.Key != "report.txt" {
		t.Fatalf("key=%q, want report.txt", resp.Key)
	}
	if resp.ContentType != "text/plain" {
		t.Fatalf("contentType=%q, want text/plain", resp.ContentType)
	}
	if got := resp.Metadata["cache-control"]; got != "no-cache" {
		t.Fatalf("metadata.cache-control=%q, want no-cache", got)
	}
}

func TestHandleDownloadObjectOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/oci-native-bucket/objects/download?key=report.txt", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if string(body) != "hello" {
		t.Fatalf("body=%q, want hello", string(body))
	}
	if got := res.Header.Get("Content-Type"); got != "application/octet-stream" {
		t.Fatalf("content-type=%q, want application/octet-stream", got)
	}
}

func TestHandleGetObjectDownloadURLOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/oci-native-bucket/objects/download-url?key=report.txt", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.PresignedURLResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.URL, "https://example.invalid/oci-native-bucket/report.txt") {
		t.Fatalf("url=%q, want fake OCI download URL", resp.URL)
	}
	if resp.ExpiresAt == "" {
		t.Fatal("expected expiresAt")
	}
}

func TestHandleCreateFolderOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodPost,
		"/api/v1/buckets/oci-native-bucket/objects/folder",
		profile.ID,
		models.CreateFolderRequest{Key: "folder/"},
	)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusCreated)
	}

	var resp models.CreateFolderResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Key != "folder/" {
		t.Fatalf("key=%q, want folder/", resp.Key)
	}

	listRes := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/oci-native-bucket/objects", profile.ID, nil)
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("list status=%d, want %d", listRes.StatusCode, http.StatusOK)
	}

	var listResp models.ListObjectsResponse
	decodeJSONResponse(t, listRes, &listResp)
	if !containsString(listResp.CommonPrefixes, "folder/") {
		t.Fatalf("commonPrefixes=%v, want folder/", listResp.CommonPrefixes)
	}

	childListRes := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodGet,
		"/api/v1/buckets/oci-native-bucket/objects?prefix=folder%2F",
		profile.ID,
		nil,
	)
	defer childListRes.Body.Close()
	if childListRes.StatusCode != http.StatusOK {
		t.Fatalf("child list status=%d, want %d", childListRes.StatusCode, http.StatusOK)
	}

	var childListResp models.ListObjectsResponse
	decodeJSONResponse(t, childListRes, &childListResp)
	if len(childListResp.Items) != 0 || len(childListResp.CommonPrefixes) != 0 {
		t.Fatalf("child list should hide marker objects, got items=%v prefixes=%v", childListResp.Items, childListResp.CommonPrefixes)
	}
}

func TestHandleDeleteObjectsOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeOciNativeRclone(t))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createOciNativeSmokeProfile(t, st)

	res := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodDelete,
		"/api/v1/buckets/oci-native-bucket/objects",
		profile.ID,
		models.DeleteObjectsRequest{Keys: []string{"report.txt"}},
	)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.DeleteObjectsResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Deleted != 1 {
		t.Fatalf("deleted=%d, want 1", resp.Deleted)
	}
}

func ociNativeSmokeProfileSecrets() models.ProfileSecrets {
	return models.ProfileSecrets{
		Provider:              models.ProfileProviderOciObjectStorage,
		Region:                ociNativeSmokeRegion,
		OciNamespace:          ociNativeSmokeNamespace,
		OciCompartment:        ociNativeSmokeCompartment,
		OciEndpoint:           ociNativeSmokeEndpoint,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	}
}

func createOciNativeSmokeProfile(t *testing.T, st *store.Store) models.Profile {
	t.Helper()

	endpoint := ociNativeSmokeEndpoint
	region := ociNativeSmokeRegion
	namespace := ociNativeSmokeNamespace
	compartment := ociNativeSmokeCompartment

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderOciObjectStorage,
		Name:                  "oci-native-smoke",
		Endpoint:              &endpoint,
		Region:                &region,
		Namespace:             &namespace,
		Compartment:           &compartment,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create OCI native profile: %v", err)
	}
	return profile
}

func writeFakeOciNativeRclone(t *testing.T) string {
	t.Helper()
	stateFile := filepath.Join(t.TempDir(), "oci-folders.txt")

	body := fmt.Sprintf(`config=''
cmd=''
target=''
prev=''
want_stat=0
want_hash=0
want_metadata=0
files_from_raw=''
for arg in "$@"; do
  if [ "$prev" = "--config" ]; then config="$arg"; fi
  if [ "$prev" = "--files-from-raw" ]; then files_from_raw="$arg"; fi
  case "$arg" in
    lsjson|mkdir|rmdir|copyto|cat|deletefile|link|delete|rcat) cmd="$arg" ;;
    --stat) want_stat=1 ;;
    --hash) want_hash=1 ;;
    --metadata) want_metadata=1 ;;
  esac
  target="$arg"
  prev="$arg"
done

[ -n "$config" ] || { echo "missing config path" >&2; exit 20; }
grep -Fxq 'type = oracleobjectstorage' "$config" || { echo "missing oracleobjectstorage backend" >&2; exit 21; }
grep -Fxq 'namespace = %s' "$config" || { echo "missing namespace" >&2; exit 21; }
grep -Fxq 'compartment = %s' "$config" || { echo "missing compartment" >&2; exit 21; }
grep -Fxq 'region = %s' "$config" || { echo "missing region" >&2; exit 21; }
grep -Fxq 'endpoint = %s' "$config" || { echo "missing endpoint" >&2; exit 21; }
state_file='%s'

case "$cmd" in
  lsjson)
    if [ "$want_stat" = "1" ]; then
      if [ "$target" = "remote:oci-native-bucket/report.txt" ]; then
        if [ "$want_metadata" = "1" ]; then
          printf '{"Path":"report.txt","Name":"report.txt","Size":5,"ModTime":"2024-01-01T00:00:00Z","MimeType":"text/plain","Hashes":{"MD5":"abc"},"Metadata":{"cache-control":"no-cache"}}'
          exit 0
        fi
        if [ "$want_hash" = "1" ]; then
          printf '{"Path":"report.txt","Name":"report.txt","Size":5,"ModTime":"2024-01-01T00:00:00Z","MimeType":"text/plain","Hashes":{"MD5":"abc"}}'
          exit 0
        fi
      fi
      printf 'unexpected stat target: %%s\n' "$target" >&2
      exit 22
    fi
    if [ "$target" = "remote:oci-native-bucket" ]; then
      printf '[{"Path":"report.txt","Name":"report.txt","Size":5,"ModTime":"2024-01-01T00:00:00Z","IsDir":false,"Hashes":{"MD5":"abc"}}'
      if [ -f "$state_file" ]; then
        while IFS= read -r marker; do
          [ -n "$marker" ] || continue
          printf ',{"Path":"%%s","Name":"%%s","Size":0,"ModTime":"2024-01-01T00:00:00Z","IsDir":false}' "$marker" "$marker"
        done < "$state_file"
      fi
      printf ']'
      exit 0
    fi
    if [ "$target" = "remote:oci-native-bucket/folder/" ]; then
      printf '[{"Path":"%s","Name":"%s","Size":0,"ModTime":"2024-01-01T00:00:00Z","IsDir":false}]'
      exit 0
    fi
    printf '[{"Name":"oci-native-bucket","IsDir":true}]'
    exit 0
    ;;
  rcat)
    if [ "$target" = "remote:oci-native-bucket/folder/%s" ]; then
      cat >/dev/null
      printf 'folder/%s\n' >> "$state_file"
      exit 0
    fi
    printf 'unexpected rcat target: %%s\n' "$target" >&2
    exit 22
    ;;
  mkdir)
    if [ "$target" = "remote:demo" ] || [ "$target" = "remote:oci-native-bucket/folder/" ]; then
      exit 0
    fi
    printf 'unexpected mkdir target: %%s\n' "$target" >&2
    exit 22
    ;;
  rmdir)
    [ "$target" = "remote:demo" ] || { printf 'unexpected rmdir target: %%s\n' "$target" >&2; exit 22; }
    exit 0
    ;;
  copyto)
    exit 0
    ;;
  cat)
    if printf '%%s' "$target" | grep -q '\.s3desk-benchmark-'; then
      printf 'benchmark-bytes'
      exit 0
    fi
    if [ "$target" = "remote:oci-native-bucket/report.txt" ]; then
      printf 'hello'
      exit 0
    fi
    printf 'unexpected cat target: %%s\n' "$target" >&2
    exit 22
    ;;
  link)
    printf 'https://example.invalid/oci-native-bucket/report.txt?signature=fake'
    exit 0
    ;;
  delete)
    [ "$target" = "remote:oci-native-bucket" ] || { printf 'unexpected delete target: %%s\n' "$target" >&2; exit 22; }
    [ -n "$files_from_raw" ] || { echo 'missing files-from-raw path' >&2; exit 22; }
    grep -Fxq 'report.txt' "$files_from_raw" || { echo 'missing report.txt delete key' >&2; exit 22; }
    exit 0
    ;;
  deletefile)
    exit 0
    ;;
esac

printf 'unexpected rclone args: %%s\n' "$*" >&2
exit 1
`, ociNativeSmokeNamespace, ociNativeSmokeCompartment, ociNativeSmokeRegion, ociNativeSmokeEndpoint, stateFile, ociFolderMarkerName, ociFolderMarkerName, ociFolderMarkerName, ociFolderMarkerName)

	return writeFakeRclone(t, body)
}

package api

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	if got := res.Header.Get("Content-Type"); got != "text/plain" {
		t.Fatalf("content-type=%q, want text/plain", got)
	}
}

func TestHandleGetObjectDownloadURLOciObjectStorageSmoke(t *testing.T) {
	lockTestEnv(t)
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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
	installOciNativeSmokeHooks(t)

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

type ociNativeSmokeState struct {
	folders map[string]struct{}
}

func installOciNativeSmokeHooks(t *testing.T) {
	t.Helper()
	state := &ociNativeSmokeState{folders: map[string]struct{}{}}
	fakeRclonePath := writeFakeRclone(t, `
cmd=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --config)
      shift 2
      continue
      ;;
    --*)
      shift
      continue
      ;;
    *)
      cmd="$1"
      shift
      break
      ;;
  esac
done
case "$cmd" in
  lsjson)
    target=""
    for last do
      target="$last"
    done
    if [ "$target" = "remote:" ]; then
      printf '[{"Name":"oci-native-bucket","Path":"oci-native-bucket","IsDir":true}]'
      exit 0
    fi
    ;;
  copyto)
    exit 0
    ;;
  cat)
    printf 'benchmark-bytes'
    exit 0
    ;;
  deletefile)
    exit 0
    ;;
esac
echo "unexpected fake rclone invocation: $cmd $*" >&2
exit 1
`)
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return fakeRclonePath, "rclone v1.66.0", nil
	})
	installAPIStartRcloneHook(t, func(secrets models.ProfileSecrets, args []string) (string, string, error) {
		if err := validateOciNativeSmokeSecrets(secrets); err != nil {
			return "", "", err
		}
		return runOciNativeSmokeCommand(args, state)
	})
	installAPIRcloneStdinHook(t, func(secrets models.ProfileSecrets, args []string, _ io.Reader) (string, error) {
		if err := validateOciNativeSmokeSecrets(secrets); err != nil {
			return "", err
		}
		_, stderr, err := runOciNativeSmokeCommand(args, state)
		return stderr, err
	})
}

func validateOciNativeSmokeSecrets(secrets models.ProfileSecrets) error {
	if secrets.Provider != models.ProfileProviderOciObjectStorage {
		return fmt.Errorf("unexpected provider: %s", secrets.Provider)
	}
	if secrets.Region != ociNativeSmokeRegion {
		return fmt.Errorf("unexpected region: %s", secrets.Region)
	}
	if secrets.OciNamespace != ociNativeSmokeNamespace {
		return fmt.Errorf("unexpected namespace: %s", secrets.OciNamespace)
	}
	if secrets.OciCompartment != ociNativeSmokeCompartment {
		return fmt.Errorf("unexpected compartment: %s", secrets.OciCompartment)
	}
	if secrets.OciEndpoint != ociNativeSmokeEndpoint {
		return fmt.Errorf("unexpected endpoint: %s", secrets.OciEndpoint)
	}
	return nil
}

func runOciNativeSmokeCommand(args []string, state *ociNativeSmokeState) (string, string, error) {
	if len(args) == 0 {
		return "", "", fmt.Errorf("unexpected empty rclone args")
	}
	target := args[len(args)-1]
	var filesFromRaw string
	wantStat := false
	wantHash := false
	wantMetadata := false
	for i, arg := range args {
		switch arg {
		case "--stat":
			wantStat = true
		case "--hash":
			wantHash = true
		case "--metadata":
			wantMetadata = true
		case "--files-from-raw":
			if i+1 < len(args) {
				filesFromRaw = args[i+1]
			}
		}
	}

	switch args[0] {
	case "lsjson":
		if wantStat {
			if target != "remote:oci-native-bucket/report.txt" {
				return "", "", fmt.Errorf("unexpected stat target: %s", target)
			}
			if wantMetadata {
				return `{"Path":"report.txt","Name":"report.txt","Size":5,"ModTime":"2024-01-01T00:00:00Z","MimeType":"text/plain","Hashes":{"MD5":"abc"},"Metadata":{"cache-control":"no-cache"}}`, "", nil
			}
			if wantHash {
				return `{"Path":"report.txt","Name":"report.txt","Size":5,"ModTime":"2024-01-01T00:00:00Z","MimeType":"text/plain","Hashes":{"MD5":"abc"}}`, "", nil
			}
			return `{"Path":"report.txt","Name":"report.txt","Size":5,"ModTime":"2024-01-01T00:00:00Z","MimeType":"text/plain"}`, "", nil
		}
		switch target {
		case "remote:oci-native-bucket":
			items := []string{
				`{"Path":"report.txt","Name":"report.txt","Size":5,"ModTime":"2024-01-01T00:00:00Z","IsDir":false,"Hashes":{"MD5":"abc"}}`,
			}
			if _, ok := state.folders["folder/"]; ok {
				items = append(items, fmt.Sprintf(`{"Path":"folder/%s","Name":"%s","Size":0,"ModTime":"2024-01-01T00:00:00Z","IsDir":false}`, ociFolderMarkerName, ociFolderMarkerName))
			}
			return "[" + strings.Join(items, ",") + "]", "", nil
		case "remote:oci-native-bucket/folder/":
			if _, ok := state.folders["folder/"]; ok {
				return fmt.Sprintf(`[{"Path":"%s","Name":"%s","Size":0,"ModTime":"2024-01-01T00:00:00Z","IsDir":false}]`, ociFolderMarkerName, ociFolderMarkerName), "", nil
			}
			return "[]", "", nil
		case "remote:":
			return `[{"Name":"oci-native-bucket","IsDir":true}]`, "", nil
		default:
			return "", "", fmt.Errorf("unexpected lsjson target: %s", target)
		}
	case "rcat":
		expectedTarget := "remote:oci-native-bucket/folder/" + ociFolderMarkerName
		if target != expectedTarget {
			return "", "", fmt.Errorf("unexpected rcat target: %s", target)
		}
		state.folders["folder/"] = struct{}{}
		return "", "", nil
	case "mkdir":
		if target == "remote:demo" || target == "remote:oci-native-bucket/folder/" {
			return "", "", nil
		}
		return "", "", fmt.Errorf("unexpected mkdir target: %s", target)
	case "rmdir":
		if target != "remote:demo" {
			return "", "", fmt.Errorf("unexpected rmdir target: %s", target)
		}
		return "", "", nil
	case "copyto":
		return "", "", nil
	case "cat":
		if strings.Contains(target, ".s3desk-benchmark-") {
			return "benchmark-bytes", "", nil
		}
		if target == "remote:oci-native-bucket/report.txt" {
			return "hello", "", nil
		}
		return "", "", fmt.Errorf("unexpected cat target: %s", target)
	case "link":
		return "https://example.invalid/oci-native-bucket/report.txt?signature=fake", "", nil
	case "delete":
		if target != "remote:oci-native-bucket" {
			return "", "", fmt.Errorf("unexpected delete target: %s", target)
		}
		if filesFromRaw == "" {
			return "", "", fmt.Errorf("missing files-from-raw path")
		}
		data, err := os.ReadFile(filesFromRaw)
		if err != nil {
			return "", "", err
		}
		if !strings.Contains(string(data), "report.txt") {
			return "", "", fmt.Errorf("missing report.txt delete key")
		}
		return "", "", nil
	case "deletefile":
		return "", "", nil
	default:
		return "", "", fmt.Errorf("unexpected rclone args: %s", joinArgs(args))
	}
}

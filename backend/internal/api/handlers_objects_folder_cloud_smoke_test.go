package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestHandleCreateFolderAzureBlobSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeCloudFolderRclone(t, cloudFolderRcloneSpec{
		backendType: "azureblob",
		assertions: []string{
			"directory_markers = true",
			"account = devstoreaccount1",
			"key = Eby8vdM02xNo=",
			"endpoint = http://127.0.0.1:10000/devstoreaccount1",
		},
	}))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createAzureBlobSmokeProfile(t, st)

	assertCreateFolderRoundTrip(t, srv, profile.ID, "azure-smoke-bucket", "folder/")
}

func TestHandleCreateFolderGcpGcsSmoke(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeCloudFolderRclone(t, cloudFolderRcloneSpec{
		backendType: "google cloud storage",
		assertions: []string{
			"directory_markers = true",
			`service_account_credentials = {"type":"service_account","project_id":"demo-project","client_email":"svc@example.com","private_key":"k"}`,
			"project_number = 123456789012",
			"endpoint = https://storage.googleapis.com",
		},
	}))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createGcpGcsSmokeProfile(t, st)

	assertCreateFolderRoundTrip(t, srv, profile.ID, "gcs-smoke-bucket", "folder/")
}

type cloudFolderRcloneSpec struct {
	backendType string
	assertions  []string
}

func createAzureBlobSmokeProfile(t *testing.T, st *store.Store) models.Profile {
	t.Helper()

	accountName := "devstoreaccount1"
	accountKey := "Eby8vdM02xNo="
	endpoint := "http://127.0.0.1:10000/devstoreaccount1"

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderAzureBlob,
		Name:                  "azure-folder-smoke",
		AccountName:           &accountName,
		AccountKey:            &accountKey,
		Endpoint:              &endpoint,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create Azure Blob profile: %v", err)
	}
	return profile
}

func createGcpGcsSmokeProfile(t *testing.T, st *store.Store) models.Profile {
	t.Helper()

	serviceAccountJSON := `{"type":"service_account","project_id":"demo-project","client_email":"svc@example.com","private_key":"k"}`
	projectNumber := "123456789012"
	endpoint := "https://storage.googleapis.com"

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderGcpGcs,
		Name:                  "gcs-folder-smoke",
		ServiceAccountJSON:    &serviceAccountJSON,
		ProjectNumber:         &projectNumber,
		Endpoint:              &endpoint,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create GCP GCS profile: %v", err)
	}
	return profile
}

func assertCreateFolderRoundTrip(t *testing.T, srv *httptest.Server, profileID, bucket, key string) {
	t.Helper()

	res := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodPost,
		"/api/v1/buckets/"+bucket+"/objects/folder",
		profileID,
		models.CreateFolderRequest{Key: key},
	)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusCreated)
	}

	var createResp models.CreateFolderResponse
	decodeJSONResponse(t, res, &createResp)
	if createResp.Key != key {
		t.Fatalf("key=%q, want %q", createResp.Key, key)
	}

	listRes := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodGet,
		"/api/v1/buckets/"+bucket+"/objects",
		profileID,
		nil,
	)
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("list status=%d, want %d", listRes.StatusCode, http.StatusOK)
	}

	var listResp models.ListObjectsResponse
	decodeJSONResponse(t, listRes, &listResp)
	if !containsString(listResp.CommonPrefixes, key) {
		t.Fatalf("commonPrefixes=%v, want %q", listResp.CommonPrefixes, key)
	}

	childListRes := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodGet,
		"/api/v1/buckets/"+bucket+"/objects?prefix=folder%2F",
		profileID,
		nil,
	)
	defer childListRes.Body.Close()
	if childListRes.StatusCode != http.StatusOK {
		t.Fatalf("child list status=%d, want %d", childListRes.StatusCode, http.StatusOK)
	}

	var childListResp models.ListObjectsResponse
	decodeJSONResponse(t, childListRes, &childListResp)
	if len(childListResp.Items) != 0 || len(childListResp.CommonPrefixes) != 0 {
		t.Fatalf("child list should remain empty, got items=%v prefixes=%v", childListResp.Items, childListResp.CommonPrefixes)
	}
}

func writeFakeCloudFolderRclone(t *testing.T, spec cloudFolderRcloneSpec) string {
	t.Helper()

	stateFile := filepath.Join(t.TempDir(), "folders.txt")
	checks := ""
	for _, assertion := range spec.assertions {
		checks += fmt.Sprintf("grep -Fqx %q \"$config\" || { echo 'missing config line: %s' >&2; exit 21; }\n", assertion, assertion)
	}

	body := fmt.Sprintf(`config=''
cmd=''
target=''
prev=''
for arg in "$@"; do
  if [ "$prev" = "--config" ]; then config="$arg"; fi
  case "$arg" in
    lsjson|mkdir|rcat) cmd="$arg" ;;
  esac
  target="$arg"
  prev="$arg"
done

[ -n "$config" ] || { echo "missing config path" >&2; exit 20; }
grep -Fqx %q "$config" || { echo "missing backend type" >&2; exit 21; }
%s
state_file=%q

case "$cmd" in
  rcat)
    case "$target" in
      remote:*/folder/)
        cat >/dev/null
        printf 'folder/\n' > "$state_file"
        exit 0
        ;;
    esac
    printf 'unexpected rcat target: %%s\n' "$target" >&2
    exit 22
    ;;
  lsjson)
    case "$target" in
      remote:*/folder/)
        printf '[]'
        exit 0
        ;;
      remote:*)
        if [ -f "$state_file" ]; then
          printf '[{"Path":"folder/","Name":"folder/","Size":0,"ModTime":"2024-01-01T00:00:00Z","IsDir":false}]'
        else
          printf '[]'
        fi
        exit 0
        ;;
    esac
    printf 'unexpected lsjson target: %%s\n' "$target" >&2
    exit 22
    ;;
esac

printf 'unexpected rclone args: %%s\n' "$*" >&2
exit 1
`, "type = "+spec.backendType, checks, stateFile)

	return writeFakeRclone(t, body)
}

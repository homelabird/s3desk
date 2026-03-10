package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestHandleCreateFolderAzureBlobSmoke(t *testing.T) {
	lockTestEnv(t)
	installCloudFolderSmokeHook(t, cloudFolderRcloneSpec{
		provider:    models.ProfileProviderAzureBlob,
		accountName: "devstoreaccount1",
		accountKey:  "Eby8vdM02xNo=",
		endpoint:    "http://127.0.0.1:10000/devstoreaccount1",
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createAzureBlobSmokeProfile(t, st)

	assertCreateFolderRoundTrip(t, srv, profile.ID, "azure-smoke-bucket", "folder/")
}

func TestHandleCreateFolderGcpGcsSmoke(t *testing.T) {
	lockTestEnv(t)
	installCloudFolderSmokeHook(t, cloudFolderRcloneSpec{
		provider:           models.ProfileProviderGcpGcs,
		serviceAccountJSON: `{"type":"service_account","project_id":"demo-project","client_email":"svc@example.com","private_key":"k"}`,
		projectNumber:      "123456789012",
		endpoint:           "https://storage.googleapis.com",
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createGcpGcsSmokeProfile(t, st)

	assertCreateFolderRoundTrip(t, srv, profile.ID, "gcs-smoke-bucket", "folder/")
}

type cloudFolderRcloneSpec struct {
	provider           models.ProfileProvider
	accountName        string
	accountKey         string
	serviceAccountJSON string
	projectNumber      string
	endpoint           string
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
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		_ = res.Body.Close()
		t.Fatalf("status=%d, want %d: %s", res.StatusCode, http.StatusCreated, string(body))
	}
	defer res.Body.Close()

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

func installCloudFolderSmokeHook(t *testing.T, spec cloudFolderRcloneSpec) {
	t.Helper()
	folders := map[string]struct{}{}
	installAPIStartRcloneHook(t, func(secrets models.ProfileSecrets, args []string) (string, string, error) {
		if err := validateCloudFolderProfileSecrets(spec, secrets); err != nil {
			return "", "", err
		}
		if len(args) == 0 {
			return "", "", errors.New("unexpected empty rclone args")
		}
		target := args[len(args)-1]
		switch args[0] {
		case "lsjson":
			if strings.HasSuffix(target, "/folder/") {
				return "[]", "", nil
			}
			if !strings.HasPrefix(target, "remote:") {
				return "", "", errors.New("unexpected lsjson target: " + target)
			}
			if _, ok := folders["folder/"]; ok {
				return `[{"Path":"folder/","Name":"folder/","Size":0,"ModTime":"2024-01-01T00:00:00Z","IsDir":false}]`, "", nil
			}
			return "[]", "", nil
		default:
			return "", "", errors.New("unexpected rclone args: " + joinArgs(args))
		}
	})
	installAPIRcloneStdinHook(t, func(secrets models.ProfileSecrets, args []string, _ io.Reader) (string, error) {
		if err := validateCloudFolderProfileSecrets(spec, secrets); err != nil {
			return "", err
		}
		if len(args) == 0 {
			return "", errors.New("unexpected empty rclone args")
		}
		target := args[len(args)-1]
		if args[0] != "rcat" {
			return "", errors.New("unexpected rclone args: " + joinArgs(args))
		}
		if !strings.HasPrefix(target, "remote:") || !strings.HasSuffix(target, "/folder/") {
			return "", errors.New("unexpected rcat target: " + target)
		}
		folders["folder/"] = struct{}{}
		return "", nil
	})
}

func validateCloudFolderProfileSecrets(spec cloudFolderRcloneSpec, secrets models.ProfileSecrets) error {
	switch spec.provider {
	case models.ProfileProviderAzureBlob:
		if secrets.Provider != models.ProfileProviderAzureBlob {
			return errors.New("unexpected provider")
		}
		if strings.TrimSpace(secrets.AzureAccountName) == "" {
			return errors.New("missing account name")
		}
		if strings.TrimSpace(secrets.AzureAccountKey) == "" {
			return errors.New("missing account key")
		}
	case models.ProfileProviderGcpGcs:
		if secrets.Provider != models.ProfileProviderGcpGcs {
			return errors.New("unexpected provider")
		}
		if normalizeCloudFolderJSON(secrets.GcpServiceAccountJSON) == "" {
			return errors.New("missing service account json")
		}
		if strings.TrimSpace(secrets.GcpProjectNumber) == "" {
			return errors.New("missing project number")
		}
	default:
		return errors.New("unexpected cloud folder provider")
	}
	return nil
}

func normalizeCloudFolderEndpoint(value string) string {
	return strings.TrimRight(strings.TrimSpace(value), "/")
}

func normalizeCloudFolderJSON(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, []byte(value)); err != nil {
		return value
	}
	return buf.String()
}

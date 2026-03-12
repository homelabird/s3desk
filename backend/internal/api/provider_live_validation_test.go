package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"

	"s3desk/internal/models"
)

// These tests are intentionally env-gated and read-only.
// They are meant for low-cost provider validation before release:
//   1. profile connectivity check
//   2. object listing against an existing bucket/container with maxKeys=1
//
// Providers covered:
//   - AWS S3
//   - GCS
//   - Azure Blob
//   - OCI Object Storage
//   - local MinIO (via s3_compatible)
//   - local Ceph RGW (via s3_compatible)
//
// To enable a provider, set its required S3DESK_LIVE_* environment variables.
// If the required variables are not present, the test is skipped.

type liveProviderValidationSpec struct {
	bucket        string
	createRequest models.ProfileCreateRequest
}

func TestLiveValidationAwsS3(t *testing.T) {
	spec, ok := loadAwsLiveValidationSpec(t)
	if !ok {
		return
	}
	runLiveProviderValidation(t, spec)
}

func TestLiveValidationGcpGcs(t *testing.T) {
	spec, ok := loadGcsLiveValidationSpec(t)
	if !ok {
		return
	}
	runLiveProviderValidation(t, spec)
}

func TestLiveValidationAzureBlob(t *testing.T) {
	spec, ok := loadAzureLiveValidationSpec(t)
	if !ok {
		return
	}
	runLiveProviderValidation(t, spec)
}

func TestLiveValidationOciObjectStorage(t *testing.T) {
	spec, ok := loadOciLiveValidationSpec(t)
	if !ok {
		return
	}
	runLiveProviderValidation(t, spec)
}

func TestLiveValidationMinioS3Compatible(t *testing.T) {
	spec, ok := loadS3CompatibleLiveValidationSpec(t, "MINIO", "minio-live-validation")
	if !ok {
		return
	}
	runLiveProviderValidation(t, spec)
}

func TestLiveValidationCephS3Compatible(t *testing.T) {
	spec, ok := loadS3CompatibleLiveValidationSpec(t, "CEPH", "ceph-live-validation")
	if !ok {
		return
	}
	runLiveProviderValidation(t, spec)
}

func runLiveProviderValidation(t *testing.T, spec liveProviderValidationSpec) {
	t.Helper()
	lockTestEnv(t)

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile, err := st.CreateProfile(context.Background(), spec.createRequest)
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/test", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("profile test status=%d, want %d: %s", res.StatusCode, http.StatusOK, string(body))
	}

	var testResp models.ProfileTestResponse
	decodeJSONResponse(t, res, &testResp)
	if !testResp.OK {
		t.Fatalf("profile test response=%+v, want ok", testResp)
	}

	bucketPath := url.PathEscape(spec.bucket)
	listPath := fmt.Sprintf("/api/v1/buckets/%s/objects?maxKeys=1", bucketPath)
	listRes := doJSONRequestWithProfile(t, srv, http.MethodGet, listPath, profile.ID, nil)
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listRes.Body)
		t.Fatalf("object list status=%d, want %d: %s", listRes.StatusCode, http.StatusOK, string(body))
	}

	var listResp models.ListObjectsResponse
	decodeJSONResponse(t, listRes, &listResp)
	if listResp.Bucket != spec.bucket {
		t.Fatalf("bucket=%q, want %q", listResp.Bucket, spec.bucket)
	}
}

func loadAwsLiveValidationSpec(t *testing.T) (liveProviderValidationSpec, bool) {
	t.Helper()
	bucket, ok := requiredLiveEnv(t, "AWS_BUCKET")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	region, ok := requiredLiveEnv(t, "AWS_REGION")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	accessKey, ok := requiredLiveEnv(t, "AWS_ACCESS_KEY_ID")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	secretKey, ok := requiredLiveEnv(t, "AWS_SECRET_ACCESS_KEY")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	endpoint := strings.TrimSpace(os.Getenv("S3DESK_LIVE_AWS_ENDPOINT"))
	sessionToken := strings.TrimSpace(os.Getenv("S3DESK_LIVE_AWS_SESSION_TOKEN"))
	forcePathStyle := liveOptionalBool("S3DESK_LIVE_AWS_FORCE_PATH_STYLE", false)

	req := models.ProfileCreateRequest{
		Provider:              models.ProfileProviderAwsS3,
		Name:                  "aws-live-validation",
		Region:                livePtrString(region),
		AccessKeyID:           livePtrString(accessKey),
		SecretAccessKey:       livePtrString(secretKey),
		ForcePathStyle:        livePtrBool(forcePathStyle),
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: liveOptionalBool("S3DESK_LIVE_AWS_TLS_SKIP_VERIFY", false),
	}
	if endpoint != "" {
		req.Endpoint = livePtrString(endpoint)
	}
	if sessionToken != "" {
		req.SessionToken = livePtrString(sessionToken)
	}

	return liveProviderValidationSpec{bucket: bucket, createRequest: req}, true
}

func loadGcsLiveValidationSpec(t *testing.T) (liveProviderValidationSpec, bool) {
	t.Helper()
	bucket, ok := requiredLiveEnv(t, "GCS_BUCKET")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	serviceAccountJSON, ok := requiredLiveEnv(t, "GCS_SERVICE_ACCOUNT_JSON")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	projectNumber, ok := requiredLiveEnv(t, "GCS_PROJECT_NUMBER")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	endpoint := strings.TrimSpace(os.Getenv("S3DESK_LIVE_GCS_ENDPOINT"))
	anonymous := liveOptionalBool("S3DESK_LIVE_GCS_ANONYMOUS", false)

	req := models.ProfileCreateRequest{
		Provider:              models.ProfileProviderGcpGcs,
		Name:                  "gcs-live-validation",
		ServiceAccountJSON:    livePtrString(serviceAccountJSON),
		ProjectNumber:         livePtrString(projectNumber),
		Anonymous:             livePtrBool(anonymous),
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: liveOptionalBool("S3DESK_LIVE_GCS_TLS_SKIP_VERIFY", false),
	}
	if endpoint != "" {
		req.Endpoint = livePtrString(endpoint)
	}

	return liveProviderValidationSpec{bucket: bucket, createRequest: req}, true
}

func loadAzureLiveValidationSpec(t *testing.T) (liveProviderValidationSpec, bool) {
	t.Helper()
	bucket, ok := requiredLiveEnv(t, "AZURE_CONTAINER")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	accountName, ok := requiredLiveEnv(t, "AZURE_ACCOUNT_NAME")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	accountKey, ok := requiredLiveEnv(t, "AZURE_ACCOUNT_KEY")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	endpoint := strings.TrimSpace(os.Getenv("S3DESK_LIVE_AZURE_ENDPOINT"))
	useEmulator := liveOptionalBool("S3DESK_LIVE_AZURE_USE_EMULATOR", false)

	req := models.ProfileCreateRequest{
		Provider:              models.ProfileProviderAzureBlob,
		Name:                  "azure-live-validation",
		AccountName:           livePtrString(accountName),
		AccountKey:            livePtrString(accountKey),
		UseEmulator:           livePtrBool(useEmulator),
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: liveOptionalBool("S3DESK_LIVE_AZURE_TLS_SKIP_VERIFY", false),
	}
	if endpoint != "" {
		req.Endpoint = livePtrString(endpoint)
	}

	return liveProviderValidationSpec{bucket: bucket, createRequest: req}, true
}

func loadOciLiveValidationSpec(t *testing.T) (liveProviderValidationSpec, bool) {
	t.Helper()
	bucket, ok := requiredLiveEnv(t, "OCI_BUCKET")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	region, ok := requiredLiveEnv(t, "OCI_REGION")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	namespace, ok := requiredLiveEnv(t, "OCI_NAMESPACE")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	compartment, ok := requiredLiveEnv(t, "OCI_COMPARTMENT")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	endpoint, ok := requiredLiveEnv(t, "OCI_ENDPOINT")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	authProvider := strings.TrimSpace(os.Getenv("S3DESK_LIVE_OCI_AUTH_PROVIDER"))
	configFile := strings.TrimSpace(os.Getenv("S3DESK_LIVE_OCI_CONFIG_FILE"))
	configProfile := strings.TrimSpace(os.Getenv("S3DESK_LIVE_OCI_CONFIG_PROFILE"))

	req := models.ProfileCreateRequest{
		Provider:              models.ProfileProviderOciObjectStorage,
		Name:                  "oci-live-validation",
		Endpoint:              livePtrString(endpoint),
		Region:                livePtrString(region),
		Namespace:             livePtrString(namespace),
		Compartment:           livePtrString(compartment),
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: liveOptionalBool("S3DESK_LIVE_OCI_TLS_SKIP_VERIFY", false),
	}
	if authProvider != "" {
		req.AuthProvider = livePtrString(authProvider)
	}
	if configFile != "" {
		req.ConfigFile = livePtrString(configFile)
	}
	if configProfile != "" {
		req.ConfigProfile = livePtrString(configProfile)
	}

	return liveProviderValidationSpec{bucket: bucket, createRequest: req}, true
}

func loadS3CompatibleLiveValidationSpec(t *testing.T, suffix, profileName string) (liveProviderValidationSpec, bool) {
	t.Helper()
	bucket, ok := requiredLiveEnv(t, suffix+"_BUCKET")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	endpoint, ok := requiredLiveEnv(t, suffix+"_ENDPOINT")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	region, ok := requiredLiveEnv(t, suffix+"_REGION")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	accessKey, ok := requiredLiveEnv(t, suffix+"_ACCESS_KEY_ID")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	secretKey, ok := requiredLiveEnv(t, suffix+"_SECRET_ACCESS_KEY")
	if !ok {
		return liveProviderValidationSpec{}, false
	}
	publicEndpoint := strings.TrimSpace(os.Getenv("S3DESK_LIVE_" + suffix + "_PUBLIC_ENDPOINT"))
	forcePathStyle := liveOptionalBool("S3DESK_LIVE_"+suffix+"_FORCE_PATH_STYLE", true)
	useTLSInsecureSkipVerify := liveOptionalBool("S3DESK_LIVE_"+suffix+"_TLS_SKIP_VERIFY", false)

	req := models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  profileName,
		Endpoint:              livePtrString(endpoint),
		Region:                livePtrString(region),
		AccessKeyID:           livePtrString(accessKey),
		SecretAccessKey:       livePtrString(secretKey),
		ForcePathStyle:        livePtrBool(forcePathStyle),
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: useTLSInsecureSkipVerify,
	}
	if publicEndpoint != "" {
		req.PublicEndpoint = livePtrString(publicEndpoint)
	}

	return liveProviderValidationSpec{bucket: bucket, createRequest: req}, true
}

func requiredLiveEnv(t *testing.T, suffix string) (string, bool) {
	t.Helper()
	key := "S3DESK_LIVE_" + suffix
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		t.Skipf("skip live validation: %s is not set", key)
		return "", false
	}
	return value, true
}

func liveOptionalBool(key string, defaultValue bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return defaultValue
	}
	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return defaultValue
	}
}

func livePtrString(value string) *string {
	return &value
}

func livePtrBool(value bool) *bool {
	return &value
}

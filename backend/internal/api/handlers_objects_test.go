package api

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/metrics"
	"s3desk/internal/models"
)

func TestListObjectsMetricOperation(t *testing.T) {
	tests := []struct {
		name              string
		delimiter         string
		continuationToken string
		want              string
	}{
		{name: "first page", delimiter: "/", continuationToken: "", want: "list_objects_first"},
		{name: "continuation page", delimiter: "/", continuationToken: "o:alpha.txt", want: "list_objects_continuation"},
		{name: "recursive first page", delimiter: "", continuationToken: "", want: "list_objects_recursive_first"},
		{name: "recursive continuation page", delimiter: "", continuationToken: "o:alpha.txt", want: "list_objects_recursive_continuation"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := listObjectsMetricOperation(tc.delimiter, tc.continuationToken); got != tc.want {
				t.Fatalf("operation=%q, want %q", got, tc.want)
			}
		})
	}
}

func TestHandleListObjectsMapsDecodeFailureToUpstreamInvalidCredentials(t *testing.T) {
	lockTestEnv(t)
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) >= 1 && args[0] == "lsjson" {
			return "[", "NotAuthenticated: The required information to complete authentication was not provided.", errors.New("exit status 9")
		}
		return "", "", errors.New("unexpected rclone args: " + joinArgs(args))
	})

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/my-test/objects?delimiter=%2F&maxKeys=200", nil)
	req = withBucketParam(req, "my-test")
	req = withProfileSecrets(req, models.ProfileSecrets{
		Provider:              models.ProfileProviderOciObjectStorage,
		Region:                "ap-tokyo-1",
		OciNamespace:          "nrszxupgigok",
		OciCompartment:        "ocid1.compartment.oc1..aaaaaaaaexample",
		OciEndpoint:           "https://objectstorage.ap-tokyo-1.oraclecloud.com",
		OciAuthProvider:       "user_principal_auth",
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	rr := httptest.NewRecorder()

	srv.handleListObjects(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusUnauthorized)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "invalid_credentials" {
		t.Fatalf("code=%q, want invalid_credentials", errResp.Error.Code)
	}
	if errResp.Error.NormalizedError == nil || errResp.Error.NormalizedError.Code != models.NormalizedErrorInvalidCredentials {
		t.Fatalf("normalizedError=%+v, want invalid_credentials", errResp.Error.NormalizedError)
	}
}

func TestHandleListObjectsEmitsSplitMetricOperations(t *testing.T) {
	lockTestEnv(t)
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) >= 1 && args[0] == "lsjson" {
			return `[{"Path":"alpha.txt","Name":"alpha.txt","Size":128,"ModTime":"2026-03-11T00:00:00Z"},{"Path":"beta.txt","Name":"beta.txt","Size":256,"ModTime":"2026-03-11T01:00:00Z"}]`, "", nil
		}
		return "", "", errors.New("unexpected rclone args: " + joinArgs(args))
	})

	srv := &server{
		cfg:     config.Config{DataDir: t.TempDir()},
		metrics: metrics.New(),
	}
	profile := models.ProfileSecrets{
		Provider:              models.ProfileProviderAwsS3,
		Region:                "us-east-1",
		AccessKeyID:           "access",
		SecretAccessKey:       "secret",
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	}

	firstReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/my-test/objects?delimiter=%2F&maxKeys=200", nil)
	firstReq = withBucketParam(firstReq, "my-test")
	firstReq = withProfileSecrets(firstReq, profile)
	firstRR := httptest.NewRecorder()
	srv.handleListObjects(firstRR, firstReq)
	if firstRR.Result().StatusCode != http.StatusOK {
		t.Fatalf("first status=%d, want %d", firstRR.Result().StatusCode, http.StatusOK)
	}

	nextReq := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/my-test/objects?delimiter=%2F&maxKeys=200&continuationToken=o%3Aalpha.txt", nil)
	nextReq = withBucketParam(nextReq, "my-test")
	nextReq = withProfileSecrets(nextReq, profile)
	nextRR := httptest.NewRecorder()
	srv.handleListObjects(nextRR, nextReq)
	if nextRR.Result().StatusCode != http.StatusOK {
		t.Fatalf("continuation status=%d, want %d", nextRR.Result().StatusCode, http.StatusOK)
	}

	metricsReq := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	metricsRR := httptest.NewRecorder()
	srv.metrics.Handler().ServeHTTP(metricsRR, metricsReq)
	body := metricsRR.Body.String()

	if !strings.Contains(body, `storage_operations_total{operation="list_objects_first",provider="aws_s3",status="success"} 1`) {
		t.Fatalf("metrics body missing first-page counter:\n%s", body)
	}
	if !strings.Contains(body, `storage_operations_total{operation="list_objects_continuation",provider="aws_s3",status="success"} 1`) {
		t.Fatalf("metrics body missing continuation counter:\n%s", body)
	}
}

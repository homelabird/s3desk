package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectCreateFolderHTTPService_HandleCreateObjectFolder_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/test-bucket/objects/folder", strings.NewReader(`{"key":"folder/"}`))
	req = withBucketParam(req, "test-bucket")
	rr := httptest.NewRecorder()

	newObjectCreateFolderHTTPService(srv).handleCreateObjectFolder(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
}

func TestObjectCreateFolderHTTPService_HandleCreateObjectFolder_ReturnsInvalidPathSegment(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/buckets/test-bucket/objects/folder", strings.NewReader(`{"key":"../folder/"}`))
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	rr := httptest.NewRecorder()

	newObjectCreateFolderHTTPService(srv).handleCreateObjectFolder(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
	if resp.Error.Message != "key contains invalid path segment" {
		t.Fatalf("resp.Error.Message=%q, want invalid path segment message", resp.Error.Message)
	}
}

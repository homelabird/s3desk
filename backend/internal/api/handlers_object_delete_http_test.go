package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectDeleteHTTPService_HandleDeleteObjects_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/test-bucket/objects", nil)
	req = withBucketParam(req, "test-bucket")
	rr := httptest.NewRecorder()

	newObjectDeleteHTTPService(srv).handleDeleteObjects(rr, req)

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

func TestObjectDeleteHTTPService_HandleDeleteObjects_ReturnsInvalidJSON(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/test-bucket/objects", strings.NewReader("{"))
	req = withBucketParam(req, "test-bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	rr := httptest.NewRecorder()

	newObjectDeleteHTTPService(srv).handleDeleteObjects(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_json" {
		t.Fatalf("resp.Error.Code=%q, want invalid_json", resp.Error.Code)
	}
}

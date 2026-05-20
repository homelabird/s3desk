package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectSearchHTTPService_HandleSearchObjects_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/search?q=report", nil)
	req = withBucketParam(req, "test-bucket")
	rr := httptest.NewRecorder()

	newObjectSearchHTTPService(srv).handleSearchObjects(rr, req)

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

func TestObjectSearchHTTPService_HandleSearchObjects_ReturnsInvalidExtension(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/search?q=report&ext=a/b", nil)
	req = withBucketParam(req, "test-bucket")
	req.Header.Set("X-Profile-Id", "profile-1")
	rr := httptest.NewRecorder()

	newObjectSearchHTTPService(srv).handleSearchObjects(rr, req)

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
	if got := resp.Error.Details["ext"]; got != "a/b" {
		t.Fatalf("details.ext=%v, want a/b", got)
	}
}

func TestObjectSearchHTTPService_HandleSearchObjects_ReturnsInvalidLimit(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/search?q=report&limit=abc", nil)
	req = withBucketParam(req, "test-bucket")
	req.Header.Set("X-Profile-Id", "profile-1")
	rr := httptest.NewRecorder()

	newObjectSearchHTTPService(srv).handleSearchObjects(rr, req)

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
	if got := resp.Error.Details["limit"]; got != "abc" {
		t.Fatalf("details.limit=%v, want abc", got)
	}
}

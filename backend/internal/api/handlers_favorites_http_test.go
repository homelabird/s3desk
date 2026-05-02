package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectFavoritesHTTPService_HandleListObjectFavorites_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/favorites", nil)
	req = withBucketParam(req, "test-bucket")
	rr := httptest.NewRecorder()

	newObjectFavoritesHTTPService(srv).handleListObjectFavorites(rr, req)

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

func TestObjectFavoritesHTTPService_HandleDeleteObjectFavorite_ReturnsMissingKey(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/test-bucket/objects/favorites", nil)
	req = withBucketParam(req, "test-bucket")
	req.Header.Set("X-Profile-Id", "profile-1")
	rr := httptest.NewRecorder()

	newObjectFavoritesHTTPService(srv).handleDeleteObjectFavorite(rr, req)

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
}

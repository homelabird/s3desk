package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectFavoritesEmptyResponseUsesArrays(t *testing.T) {
	for _, keys := range [][]string{nil, {}} {
		body, err := json.Marshal(buildObjectFavoritesListResponse("bucket", "", keys, nil))
		if err != nil {
			t.Fatal(err)
		}
		var response map[string]json.RawMessage
		if err := json.Unmarshal(body, &response); err != nil {
			t.Fatal(err)
		}
		for _, field := range []string{"keys", "items"} {
			if string(response[field]) != "[]" {
				t.Fatalf("%s = %s, want []", field, response[field])
			}
		}
	}
}

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

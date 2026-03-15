package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestCreateObjectFavoriteRejectsUnsupportedControlCharacters(t *testing.T) {
	st, srv := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)

	req := models.ObjectFavoriteCreateRequest{Key: "bad\nkey"}
	res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/buckets/mybucket/objects/favorites", profile.ID, req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", res.StatusCode)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %q", errResp.Error.Code)
	}
	if !strings.Contains(errResp.Error.Message, "unsupported control characters") {
		t.Fatalf("expected control character error, got %q", errResp.Error.Message)
	}
}

func TestListObjectFavoritesRejectsUnsupportedControlCharactersWhenHydrating(t *testing.T) {
	st, srv := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)

	if _, err := st.AddObjectFavorite(context.Background(), profile.ID, "mybucket", "bad\nkey"); err != nil {
		t.Fatalf("add favorite: %v", err)
	}

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/mybucket/objects/favorites?hydrate=true", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", res.StatusCode)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %q", errResp.Error.Code)
	}
	if !strings.Contains(errResp.Error.Message, "unsupported control characters") {
		t.Fatalf("expected control character error, got %q", errResp.Error.Message)
	}
}

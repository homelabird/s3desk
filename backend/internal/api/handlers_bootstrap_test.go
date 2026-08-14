package api

import (
	"net/http"
	"testing"

	"s3desk/internal/models"
)

func TestGetBootstrapReturnsMetaAndProfiles(t *testing.T) {
	t.Parallel()

	store, srv := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, store)

	res := doJSONRequest(t, srv, http.MethodGet, "/api/v1/bootstrap", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var response models.BootstrapResponse
	decodeJSONResponse(t, res, &response)
	if response.Meta.DBBackend != "sqlite" {
		t.Fatalf("dbBackend=%q, want sqlite", response.Meta.DBBackend)
	}
	if len(response.Profiles) != 1 || response.Profiles[0].ID != profile.ID {
		t.Fatalf("profiles=%v, want profile %q", response.Profiles, profile.ID)
	}
}

package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestProfileListHTTPService_HandleListProfiles_ReturnsDecoratedProfiles(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	svc := newProfileListHTTPService(&server{
		store: st,
		cfg:   config.Config{UploadDirectStream: true},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/profiles", nil)

	svc.handleListProfiles(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}
	var resp []models.Profile
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp) != 1 {
		t.Fatalf("len(resp)=%d, want 1", len(resp))
	}
	if resp[0].ID != profile.ID {
		t.Fatalf("resp[0].ID=%q, want %q", resp[0].ID, profile.ID)
	}
	if resp[0].EffectiveCapabilities == nil {
		t.Fatal("expected effective capabilities")
	}
	if !resp[0].EffectiveCapabilities.DirectUpload {
		t.Fatal("expected direct upload capability to reflect server config")
	}
}

package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestProfileWriteHTTPService_HandleCreateProfile_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newProfileWriteHTTPService(&server{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/profiles", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")

	svc.handleCreateProfile(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_json" {
		t.Fatalf("resp.Error.Code=%q, want invalid_json", resp.Error.Code)
	}
}

func TestProfileWriteHTTPService_HandleCreateProfile_ReturnsCreatedProfile(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	svc := newProfileWriteHTTPService(&server{
		store: st,
		cfg:   config.Config{UploadDirectStream: true},
	})
	endpoint := "http://127.0.0.1:9000"
	region := "us-east-1"
	accessKeyID := "access"
	secretAccessKey := "secret"
	body, err := json.Marshal(models.ProfileCreateRequest{
		Name:            "demo",
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        &endpoint,
		Region:          &region,
		AccessKeyID:     &accessKeyID,
		SecretAccessKey: &secretAccessKey,
	})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/profiles", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	svc.handleCreateProfile(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusCreated)
	}
	var resp models.Profile
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Name != "demo" {
		t.Fatalf("resp.Name=%q, want demo", resp.Name)
	}
	if resp.EffectiveCapabilities == nil || !resp.EffectiveCapabilities.DirectUpload {
		t.Fatalf("resp.EffectiveCapabilities=%+v, want direct upload enabled", resp.EffectiveCapabilities)
	}
}

func TestProfileWriteHTTPService_HandleUpdateProfile_ReturnsUpdatedProfile(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	svc := newProfileWriteHTTPService(&server{store: st})
	name := "updated-profile"
	body, err := json.Marshal(models.ProfileUpdateRequest{Name: &name})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodPatch, "/api/v1/profiles/"+profile.ID, bytes.NewReader(body)), profile.ID)
	req.Header.Set("Content-Type", "application/json")

	svc.handleUpdateProfile(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}
	var resp models.Profile
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Name != name {
		t.Fatalf("resp.Name=%q, want %q", resp.Name, name)
	}
}

func TestProfileWriteHTTPService_HandleUpdateProfile_ReturnsNotFound(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	svc := newProfileWriteHTTPService(&server{store: st})
	name := "updated-profile"
	body, err := json.Marshal(models.ProfileUpdateRequest{Name: &name})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodPatch, "/api/v1/profiles/missing", bytes.NewReader(body)), "missing")
	req.Header.Set("Content-Type", "application/json")

	svc.handleUpdateProfile(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNotFound)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "not_found" {
		t.Fatalf("resp.Error.Code=%q, want not_found", resp.Error.Code)
	}
}

func TestLoadCurrentProfileForUpdate_ReturnsNotFound(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	svc := newProfileWriteHTTPService(&server{store: st})
	profile, err := svc.loadCurrentProfileForUpdate(t.Context(), "missing")
	if err == nil {
		t.Fatal("expected error")
	}
	if profile.ID != "" {
		t.Fatalf("profile.ID=%q, want empty", profile.ID)
	}
	if err.code != "not_found" {
		t.Fatalf("err.code=%q, want not_found", err.code)
	}
}

func TestPrepareUpdateProfile_RejectsInvalidTLSSkipVerify(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	svc := newProfileWriteHTTPService(&server{store: st})
	flag := true
	body, err := json.Marshal(models.ProfileUpdateRequest{TLSInsecureSkipVerify: &flag})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	req := withProfileIDParam(httptest.NewRequest(http.MethodPatch, "/api/v1/profiles/"+profile.ID, bytes.NewReader(body)), profile.ID)
	req.Header.Set("Content-Type", "application/json")

	got := svc.prepareUpdateProfile(req)
	if got.err == nil {
		t.Fatal("expected error")
	}
}

func TestPrepareCreateProfile_ReturnsPreparedCreateRequest(t *testing.T) {
	t.Parallel()

	svc := newProfileWriteHTTPService(&server{})
	endpoint := "http://127.0.0.1:9000"
	region := "us-east-1"
	accessKeyID := "access"
	secretAccessKey := "secret"
	body, err := json.Marshal(models.ProfileCreateRequest{
		Name:            "demo",
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        &endpoint,
		Region:          &region,
		AccessKeyID:     &accessKeyID,
		SecretAccessKey: &secretAccessKey,
	})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/profiles", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	got := svc.prepareCreateProfile(req)
	if got.kind != profileWriteCreate {
		t.Fatalf("got.kind=%q, want %q", got.kind, profileWriteCreate)
	}
	if got.createReq.Name != "demo" {
		t.Fatalf("got.createReq.Name=%q, want %q", got.createReq.Name, "demo")
	}
}

func TestExecuteCreatePrepared_ReturnsDecoratedProfile(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	svc := newProfileWriteHTTPService(&server{store: st, cfg: config.Config{UploadDirectStream: true}})
	endpoint := "http://127.0.0.1:9000"
	region := "us-east-1"
	accessKeyID := "access"
	secretAccessKey := "secret"

	resp, err := svc.executeCreatePrepared(t.Context(), profileWritePreparedRequest{
		kind: profileWriteCreate,
		createReq: models.ProfileCreateRequest{
			Name:            "demo",
			Provider:        models.ProfileProviderS3Compatible,
			Endpoint:        &endpoint,
			Region:          &region,
			AccessKeyID:     &accessKeyID,
			SecretAccessKey: &secretAccessKey,
		},
	})
	if err != nil {
		t.Fatalf("err=%v, want nil", err)
	}
	if resp == nil {
		t.Fatal("expected response")
	}
	if resp.Name != "demo" {
		t.Fatalf("resp.Name=%q, want demo", resp.Name)
	}
	if resp.EffectiveCapabilities == nil || !resp.EffectiveCapabilities.DirectUpload {
		t.Fatalf("resp.EffectiveCapabilities=%+v, want direct upload enabled", resp.EffectiveCapabilities)
	}
}

func TestExecuteUpdatePrepared_ReturnsNotFound(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	svc := newProfileWriteHTTPService(&server{store: st})
	name := "updated-profile"

	resp, err := svc.executeUpdatePrepared(t.Context(), profileWritePreparedRequest{
		kind:      profileWriteUpdate,
		profileID: "missing",
		updateReq: models.ProfileUpdateRequest{Name: &name},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if resp != nil {
		t.Fatalf("resp=%+v, want nil", resp)
	}
	var prepErr *profileWritePreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%T, want profileWritePreparationError", err)
	}
	if prepErr.code != "not_found" {
		t.Fatalf("prepErr.code=%q, want not_found", prepErr.code)
	}
}

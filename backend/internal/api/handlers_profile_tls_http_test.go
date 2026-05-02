package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/models"
)

func TestPreparePutProfileTLS_RequiresClientCertAndKeyForMTLS(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	svc := newProfileTLSHTTPService(&server{store: st})
	body, err := json.Marshal(models.ProfileTLSConfig{Mode: models.ProfileTLSModeMTLS})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	req := withProfileIDParam(httptest.NewRequest(http.MethodPut, "/api/v1/profiles/"+profile.ID+"/tls", bytes.NewReader(body)), profile.ID)
	req.Header.Set("Content-Type", "application/json")
	_, _, err = svc.preparePutProfileTLS(req)

	var apiErr *profileTLSHTTPError
	if !errors.As(err, &apiErr) {
		t.Fatalf("err=%v, want profileTLSHTTPError", err)
	}
	if apiErr.code != "invalid_request" {
		t.Fatalf("apiErr.code=%q, want invalid_request", apiErr.code)
	}
}

func TestPreparePutProfileTLS_NormalizesDisabledModeAndClearsMaterial(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	svc := newProfileTLSHTTPService(&server{store: st})
	body, err := json.Marshal(models.ProfileTLSConfig{
		Mode:          models.ProfileTLSModeDisabled,
		ClientCertPEM: " cert ",
		ClientKeyPEM:  " key ",
		CACertPEM:     " ca ",
	})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	req := withProfileIDParam(httptest.NewRequest(http.MethodPut, "/api/v1/profiles/"+profile.ID+"/tls", bytes.NewReader(body)), profile.ID)
	req.Header.Set("Content-Type", "application/json")
	_, putReq, err := svc.preparePutProfileTLS(req)
	if err != nil {
		t.Fatalf("err=%v, want nil", err)
	}
	if putReq.Mode != models.ProfileTLSModeDisabled {
		t.Fatalf("putReq.Mode=%q, want disabled", putReq.Mode)
	}
	if putReq.ClientCertPEM != "" || putReq.ClientKeyPEM != "" || putReq.CACertPEM != "" {
		t.Fatalf("putReq=%+v, want cleared tls material", putReq)
	}
}

func TestProfileTLSHTTPService_HandleDeleteProfileTLS_WritesNoContent(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	svc := newProfileTLSHTTPService(&server{store: st})
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodDelete, "/api/v1/profiles/"+profile.ID+"/tls", nil), profile.ID)

	svc.handleDeleteProfileTLS(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNoContent)
	}
}

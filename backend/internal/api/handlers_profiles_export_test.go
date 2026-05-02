package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestProfileExportHTTPService_PrepareExportProfile_RequiresProfileID(t *testing.T) {
	t.Parallel()

	prepared := newProfileExportHTTPService(&server{}).prepareExportProfile(
		httptest.NewRequest(http.MethodGet, "/api/v1/profiles/export", nil),
	)
	if prepared.err == nil {
		t.Fatal("expected error")
	}
}

func TestExecutePreparedProfileExport_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newProfileExportHTTPService(&server{})

	body, filename, err := svc.executePrepared(profileExportPreparedRequest{
		profileID: "profile-1",
		err:       newProfileExportPreparationError(http.StatusBadRequest, "invalid_request", "bad request", nil),
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if body != nil || filename != "" {
		t.Fatalf("body=%v filename=%q, want zero values", body, filename)
	}
	var prepErr *profileExportPreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%T, want profileExportPreparationError", err)
	}
	if prepErr.code != "invalid_request" {
		t.Fatalf("prepErr.code=%q, want invalid_request", prepErr.code)
	}
}

func TestExecutePreparedProfileExport_UsesPreparedExecution(t *testing.T) {
	t.Parallel()

	svc := newProfileExportHTTPService(&server{})

	body, filename, err := svc.executePrepared(profileExportPreparedRequest{
		profileID: "profile-1",
		secrets: models.ProfileSecrets{
			ID:              "profile-1",
			Name:            "demo",
			Provider:        models.ProfileProviderS3Compatible,
			Endpoint:        "http://127.0.0.1:9000",
			AccessKeyID:     "access",
			SecretAccessKey: "secret",
		},
		download: true,
	})
	if err != nil {
		t.Fatalf("err=%v, want nil", err)
	}
	if filename == "" {
		t.Fatal("expected download filename")
	}
	if !strings.Contains(string(body), "name: demo") {
		t.Fatalf("body=%q, want exported name", string(body))
	}
}

func TestExecuteExport_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newProfileExportHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/profiles/profile-1/export", nil)

	body, filename, err := svc.executeExport(req)
	if err == nil {
		t.Fatal("expected error")
	}
	if body != nil || filename != "" {
		t.Fatalf("body=%v filename=%q, want zero values", body, filename)
	}
	var prepErr *profileExportPreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%T, want profileExportPreparationError", err)
	}
	if prepErr.code != "invalid_request" {
		t.Fatalf("prepErr.code=%q, want invalid_request", prepErr.code)
	}
}

func TestProfileExportHTTPService_HandleExport_ReturnsYAMLWithTLS(t *testing.T) {
	t.Parallel()

	st, srv := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	_, updatedAt, err := st.UpsertProfileTLSConfig(context.Background(), profile.ID, models.ProfileTLSConfig{
		Mode:          models.ProfileTLSModeMTLS,
		ClientCertPEM: "client-cert",
		ClientKeyPEM:  "client-key",
		CACertPEM:     "ca-cert",
	})
	if err != nil {
		t.Fatalf("UpsertProfileTLSConfig: %v", err)
	}

	res := doJSONRequest(t, srv, http.MethodGet, "/api/v1/profiles/"+profile.ID+"/export?download=1", nil)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("res.StatusCode=%d, want %d", res.StatusCode, http.StatusOK)
	}
	if got := res.Header.Get("Content-Type"); got != "application/yaml; charset=utf-8" {
		t.Fatalf("Content-Type=%q, want application/yaml; charset=utf-8", got)
	}
	if got := res.Header.Get("Content-Disposition"); !strings.Contains(got, "test-profile.yaml") {
		t.Fatalf("Content-Disposition=%q, want exported filename", got)
	}

	body := mustReadResponseBody(t, res)
	for _, want := range []string{
		"name: test-profile",
		"provider: s3_compatible",
		"endpoint: http://127.0.0.1:9000",
		"accessKeyId: access",
		"secretAccessKey: secret",
		"mode: mtls",
		"clientCertPem: client-cert",
		"clientKeyPem: client-key",
		"caCertPem: ca-cert",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("body missing %q:\n%s", want, body)
		}
	}
	if !strings.Contains(body, updatedAt) {
		t.Fatalf("body missing updatedAt %q:\n%s", updatedAt, body)
	}
}

func TestProfileExportHTTPService_HandleExportProfile_ReturnsNotFound(t *testing.T) {
	t.Parallel()

	st, _ := newTestServer(t, testEncryptionKey())
	svc := newProfileExportHTTPService(&server{store: st})
	rec := httptest.NewRecorder()
	req := withProfileIDParam(httptest.NewRequest(http.MethodGet, "/api/v1/profiles/missing/export", nil), "missing")

	svc.handleExportProfile(rec, req)

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

func mustReadResponseBody(t *testing.T, res *http.Response) string {
	t.Helper()

	data, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return string(data)
}

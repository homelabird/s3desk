package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestServerRestoreHTTPService_PrepareDeleteServerRestore_RequiresRestoreID(t *testing.T) {
	t.Parallel()

	svc := newServerRestoreHTTPService(&server{cfg: config.Config{DataDir: t.TempDir()}})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/server/restores", nil)

	_, _, _, err := svc.prepareDeleteServerRestore(req)
	if err == nil {
		t.Fatal("expected error")
	}
	if _, ok := err.(*serverRestorePreparationError); !ok {
		t.Fatalf("err=%v, want serverRestorePreparationError", err)
	}
}

func TestServerRestoreHTTPService_HandleListServerRestores_ReturnsStagedRestores(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	restoreDir := filepath.Join(dataDir, "restores", "restore-1")
	if err := os.MkdirAll(restoreDir, 0o755); err != nil {
		t.Fatalf("mkdir restore dir: %v", err)
	}
	manifest := models.ServerMigrationManifest{
		Format:     "server_backup",
		BundleKind: serverBackupScopeFull,
		CreatedAt:  "2026-04-11T00:00:00Z",
		AppVersion: "test",
		DBBackend:  "sqlite",
	}
	if err := os.WriteFile(filepath.Join(restoreDir, "manifest.json"), mustJSON(t, manifest), 0o600); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	svc := newServerRestoreHTTPService(&server{cfg: config.Config{DataDir: dataDir}})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/server/restores", nil)

	svc.handleListServerRestores(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}
	var resp models.ServerStagedRestoreListResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("len(resp.Items)=%d, want 1", len(resp.Items))
	}
	if resp.Items[0].ID != "restore-1" {
		t.Fatalf("resp.Items[0].ID=%q, want restore-1", resp.Items[0].ID)
	}
	if resp.Items[0].Manifest == nil || resp.Items[0].Manifest.BundleKind != serverBackupScopeFull {
		t.Fatalf("resp.Items[0].Manifest=%+v, want bundleKind=%q", resp.Items[0].Manifest, serverBackupScopeFull)
	}
}

func TestServerRestoreHTTPService_HandleDeleteServerRestore_RemovesRestore(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	restoreDir := filepath.Join(dataDir, "restores", "restore-1")
	if err := os.MkdirAll(restoreDir, 0o755); err != nil {
		t.Fatalf("mkdir restore dir: %v", err)
	}

	svc := newServerRestoreHTTPService(&server{cfg: config.Config{DataDir: dataDir}})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/server/restores/restore-1", nil)
	req = withRestoreIDParam(req, "restore-1")

	svc.handleDeleteServerRestore(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNoContent)
	}
	if _, err := os.Stat(restoreDir); !os.IsNotExist(err) {
		t.Fatalf("restoreDir still exists or unexpected stat err: %v", err)
	}
}

func TestServerRestoreHTTPService_HandleDeleteServerRestore_ReturnsNotFound(t *testing.T) {
	t.Parallel()

	svc := newServerRestoreHTTPService(&server{cfg: config.Config{DataDir: t.TempDir()}})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/server/restores/missing", nil)
	req = withRestoreIDParam(req, "missing")

	svc.handleDeleteServerRestore(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestServerRestoreHTTPService_ExecuteDelete_PreservesPreparationError(t *testing.T) {
	t.Parallel()

	svc := newServerRestoreHTTPService(&server{cfg: config.Config{DataDir: t.TempDir()}})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/server/restores", nil)

	err := svc.executeDelete(req)
	if err == nil {
		t.Fatal("expected error")
	}
	if _, ok := err.(*serverRestorePreparationError); !ok {
		t.Fatalf("err=%T, want serverRestorePreparationError", err)
	}
}

func withRestoreIDParam(req *http.Request, restoreID string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("restoreId", restoreID)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

func TestServerBackupHTTPService_HandleGetServerBackup_ReturnsBackupUnsupportedForPostgres(t *testing.T) {
	t.Parallel()

	svc := serverBackupHTTPService{
		dbBackend:     string(db.BackendPostgres),
		encryptionKey: testEncryptionKey(),
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/server/backup?scope=full", nil)
	rec := httptest.NewRecorder()

	svc.handleGetServerBackup(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusConflict)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "backup_unsupported" {
		t.Fatalf("resp.Error.Code=%q, want backup_unsupported", resp.Error.Code)
	}
}

func TestServerBackupHTTPService_HandleGetServerBackup_WritesAttachment(t *testing.T) {
	t.Parallel()

	archiveBytes := []byte("backup-data")
	var archivePath string
	svc := serverBackupHTTPService{
		dbBackend:     string(db.BackendSQLite),
		encryptionKey: testEncryptionKey(),
		exportArchive: func(_ context.Context, path string, scope string, confidentiality string, includeThumbnails bool, _ serverBackupSecrets) (models.ServerMigrationManifest, error) {
			archivePath = path
			if scope != serverBackupScopeFull {
				t.Fatalf("scope=%q, want %q", scope, serverBackupScopeFull)
			}
			if confidentiality != serverBackupConfidentialityClear {
				t.Fatalf("confidentiality=%q, want %q", confidentiality, serverBackupConfidentialityClear)
			}
			if err := os.WriteFile(path, archiveBytes, 0o600); err != nil {
				t.Fatalf("write archive: %v", err)
			}
			return models.ServerMigrationManifest{}, nil
		},
		now: func() time.Time { return time.Date(2026, 4, 17, 12, 0, 0, 0, time.UTC) },
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/server/backup?scope=full", nil)

	svc.handleGetServerBackup(rec, req)

	res := rec.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("res.StatusCode=%d, want %d", res.StatusCode, http.StatusOK)
	}
	if got := res.Header.Get("Content-Type"); !strings.Contains(got, "application/gzip") {
		t.Fatalf("content-type=%q, want application/gzip", got)
	}
	_, params, err := mime.ParseMediaType(res.Header.Get("Content-Disposition"))
	if err != nil {
		t.Fatalf("parse content disposition: %v", err)
	}
	if params["filename"] != "s3desk-full-backup-20260417-120000.tar.gz" {
		t.Fatalf("filename=%q, want s3desk-full-backup-20260417-120000.tar.gz", params["filename"])
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if !bytes.Equal(body, archiveBytes) {
		t.Fatalf("body=%q, want %q", string(body), string(archiveBytes))
	}
	if _, err := os.Stat(archivePath); !os.IsNotExist(err) {
		t.Fatalf("archive should be removed after write, err=%v", err)
	}
}

func TestServerBackupHTTPService_HandleRestoreServerBackup_MapsPreflightError(t *testing.T) {
	t.Parallel()

	svc := serverBackupHTTPService{
		encryptionKey: "enc-key",
		openRequest: func(_ http.ResponseWriter, _ *http.Request, _ serverRestoreBundleOpenOptions) (io.ReadCloser, string, func(), bool) {
			return io.NopCloser(strings.NewReader("bundle")), "bundle-password", func() {}, true
		},
		restoreArchive: func(_ context.Context, _ io.Reader, _ string, _ string) (models.ServerRestoreResponse, error) {
			return models.ServerRestoreResponse{}, serverRestorePreflightError{Path: "/tmp", RequiredBytes: 10, AvailableBytes: 5}
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/server/restore", nil)
	rec := httptest.NewRecorder()

	svc.handleRestoreServerBackup(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusConflict)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "restore_preflight_failed" {
		t.Fatalf("resp.Error.Code=%q, want restore_preflight_failed", resp.Error.Code)
	}
	if got, _ := resp.Error.Details["path"].(string); got != "/tmp" {
		t.Fatalf("resp.Error.Details[path]=%q, want /tmp", got)
	}
}

func TestServerBackupHTTPService_HandleRestoreServerBackup_ReturnsCreatedResponse(t *testing.T) {
	t.Parallel()

	cleanupCalled := false
	svc := serverBackupHTTPService{
		encryptionKey: "enc-key",
		openRequest: func(_ http.ResponseWriter, _ *http.Request, _ serverRestoreBundleOpenOptions) (io.ReadCloser, string, func(), bool) {
			return io.NopCloser(strings.NewReader("bundle")), "bundle-password", func() { cleanupCalled = true }, true
		},
		restoreArchive: func(_ context.Context, _ io.Reader, backupPassword string, encryptionKey string) (models.ServerRestoreResponse, error) {
			if backupPassword != "bundle-password" {
				t.Fatalf("backupPassword=%q, want bundle-password", backupPassword)
			}
			if encryptionKey != "enc-key" {
				t.Fatalf("encryptionKey=%q, want enc-key", encryptionKey)
			}
			return models.ServerRestoreResponse{
				StagingDir:      "/tmp/restores/restore-1",
				RestartRequired: true,
			}, nil
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/server/restore", nil)
	rec := httptest.NewRecorder()

	svc.handleRestoreServerBackup(rec, req)

	if !cleanupCalled {
		t.Fatal("expected cleanup to be called")
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusCreated)
	}
	var resp models.ServerRestoreResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.StagingDir != "/tmp/restores/restore-1" {
		t.Fatalf("resp.StagingDir=%q, want /tmp/restores/restore-1", resp.StagingDir)
	}
	if !resp.RestartRequired {
		t.Fatal("expected restartRequired=true")
	}
}

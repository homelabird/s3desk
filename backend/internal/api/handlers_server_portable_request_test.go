package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

func TestPortableImportArchiveService_ProcessDryRunSkipsApplyAndCleansUp(t *testing.T) {
	t.Parallel()

	cleanupPath := ""
	applyCalled := false
	svc := portableImportArchiveService{
		dbBackend: string(db.BackendSQLite),
		extract: func(_ context.Context, _ io.Reader, backupPassword string, encryptionKey string) (string, models.ServerMigrationManifest, map[string][]byte, string, error) {
			if backupPassword != "operator-secret" {
				t.Fatalf("backupPassword=%q, want operator-secret", backupPassword)
			}
			if encryptionKey != "enc-key" {
				t.Fatalf("encryptionKey=%q, want enc-key", encryptionKey)
			}
			return "/tmp/portable-import-dry-run", models.ServerMigrationManifest{BundleKind: serverBackupScopePortable}, map[string][]byte{
				"profiles": []byte("[]\n"),
			}, "/tmp/assets", nil
		},
		buildResponse: func(mode string, dbBackend db.Backend, manifest models.ServerMigrationManifest, entityFiles map[string][]byte) models.ServerPortableImportResponse {
			if mode != portableImportModeDryRun {
				t.Fatalf("mode=%q, want %q", mode, portableImportModeDryRun)
			}
			if dbBackend != db.BackendSQLite {
				t.Fatalf("dbBackend=%q, want %q", dbBackend, db.BackendSQLite)
			}
			if manifest.BundleKind != serverBackupScopePortable {
				t.Fatalf("bundleKind=%q, want %q", manifest.BundleKind, serverBackupScopePortable)
			}
			if len(entityFiles) != 1 {
				t.Fatalf("len(entityFiles)=%d, want 1", len(entityFiles))
			}
			return models.ServerPortableImportResponse{Mode: mode}
		},
		applyPayload: func(context.Context, *models.ServerPortableImportResponse, map[string][]byte, string) error {
			applyCalled = true
			return nil
		},
		cleanup: func(path string) error {
			cleanupPath = path
			return nil
		},
	}

	response, outcome, err := svc.process(context.Background(), bytes.NewReader(nil), portableImportModeDryRun, "operator-secret", "enc-key")
	if err != nil {
		t.Fatalf("process() error = %v", err)
	}
	if applyCalled {
		t.Fatal("expected dry-run mode to skip applyPayload")
	}
	if cleanupPath != "/tmp/portable-import-dry-run" {
		t.Fatalf("cleanupPath=%q, want %q", cleanupPath, "/tmp/portable-import-dry-run")
	}
	if response.Mode != portableImportModeDryRun {
		t.Fatalf("resp.Mode=%q, want %q", response.Mode, portableImportModeDryRun)
	}
	if outcome != portableImportArchiveOutcomeDryRun {
		t.Fatalf("outcome=%q, want %q", outcome, portableImportArchiveOutcomeDryRun)
	}
}

func TestPortableImportArchiveService_ProcessBlockedReplaceSkipsApplyAndCleansUp(t *testing.T) {
	t.Parallel()

	cleanupCalls := 0
	applyCalled := false
	svc := portableImportArchiveService{
		dbBackend: string(db.BackendSQLite),
		extract: func(_ context.Context, _ io.Reader, _, _ string) (string, models.ServerMigrationManifest, map[string][]byte, string, error) {
			return "/tmp/portable-import-blocked", models.ServerMigrationManifest{BundleKind: serverBackupScopePortable}, nil, "", nil
		},
		buildResponse: func(mode string, _ db.Backend, _ models.ServerMigrationManifest, _ map[string][]byte) models.ServerPortableImportResponse {
			return models.ServerPortableImportResponse{
				Mode: mode,
				Preflight: models.ServerPortableImportPreflight{
					Blockers: []string{"portable bundle is blocked"},
				},
			}
		},
		applyPayload: func(context.Context, *models.ServerPortableImportResponse, map[string][]byte, string) error {
			applyCalled = true
			return nil
		},
		cleanup: func(path string) error {
			if path != "/tmp/portable-import-blocked" {
				t.Fatalf("cleanup path=%q, want %q", path, "/tmp/portable-import-blocked")
			}
			cleanupCalls++
			return nil
		},
	}

	response, outcome, err := svc.process(context.Background(), bytes.NewReader(nil), portableImportModeReplace, "", "")
	if err != nil {
		t.Fatalf("process() error = %v", err)
	}
	if applyCalled {
		t.Fatal("expected blocked replace mode to skip applyPayload")
	}
	if cleanupCalls != 1 {
		t.Fatalf("cleanupCalls=%d, want 1", cleanupCalls)
	}
	if len(response.Preflight.Blockers) != 1 {
		t.Fatalf("len(resp.Preflight.Blockers)=%d, want 1", len(response.Preflight.Blockers))
	}
	if outcome != portableImportArchiveOutcomeBlocked {
		t.Fatalf("outcome=%q, want %q", outcome, portableImportArchiveOutcomeBlocked)
	}
}

func TestPortableImportArchiveService_ProcessReplaceAppliesAndCleansUpOnError(t *testing.T) {
	t.Parallel()

	cleanupPath := ""
	applyCalls := 0
	wantErr := errors.New("replace failed")
	svc := portableImportArchiveService{
		dbBackend: string(db.BackendSQLite),
		extract: func(_ context.Context, _ io.Reader, _, _ string) (string, models.ServerMigrationManifest, map[string][]byte, string, error) {
			return "/tmp/portable-import-replace", models.ServerMigrationManifest{BundleKind: serverBackupScopePortable}, map[string][]byte{
				"profiles": []byte("[]\n"),
			}, "/tmp/assets", nil
		},
		buildResponse: func(mode string, _ db.Backend, _ models.ServerMigrationManifest, _ map[string][]byte) models.ServerPortableImportResponse {
			return models.ServerPortableImportResponse{Mode: mode}
		},
		applyPayload: func(_ context.Context, resp *models.ServerPortableImportResponse, entityFiles map[string][]byte, assetRoot string) error {
			applyCalls++
			if resp.Mode != portableImportModeReplace {
				t.Fatalf("resp.Mode=%q, want %q", resp.Mode, portableImportModeReplace)
			}
			if len(entityFiles) != 1 {
				t.Fatalf("len(entityFiles)=%d, want 1", len(entityFiles))
			}
			if assetRoot != "/tmp/assets" {
				t.Fatalf("assetRoot=%q, want %q", assetRoot, "/tmp/assets")
			}
			return wantErr
		},
		cleanup: func(path string) error {
			cleanupPath = path
			return nil
		},
	}

	_, _, err := svc.process(context.Background(), bytes.NewReader(nil), portableImportModeReplace, "", "")
	if !errors.Is(err, wantErr) {
		t.Fatalf("process() error = %v, want %v", err, wantErr)
	}
	if applyCalls != 1 {
		t.Fatalf("applyCalls=%d, want 1", applyCalls)
	}
	if cleanupPath != "/tmp/portable-import-replace" {
		t.Fatalf("cleanupPath=%q, want %q", cleanupPath, "/tmp/portable-import-replace")
	}
}

func TestPortableImportArchiveService_ProcessReplaceAppliedReturnsAppliedOutcome(t *testing.T) {
	t.Parallel()

	svc := portableImportArchiveService{
		dbBackend: string(db.BackendSQLite),
		extract: func(_ context.Context, _ io.Reader, _, _ string) (string, models.ServerMigrationManifest, map[string][]byte, string, error) {
			return "", models.ServerMigrationManifest{BundleKind: serverBackupScopePortable}, nil, "", nil
		},
		buildResponse: func(mode string, _ db.Backend, _ models.ServerMigrationManifest, _ map[string][]byte) models.ServerPortableImportResponse {
			return models.ServerPortableImportResponse{Mode: mode}
		},
		applyPayload: func(_ context.Context, _ *models.ServerPortableImportResponse, _ map[string][]byte, _ string) error {
			return nil
		},
		cleanup: func(string) error { return nil },
	}

	response, outcome, err := svc.process(context.Background(), bytes.NewReader(nil), portableImportModeReplace, "", "")
	if err != nil {
		t.Fatalf("process() error = %v", err)
	}
	if outcome != portableImportArchiveOutcomeApplied {
		t.Fatalf("outcome=%q, want %q", outcome, portableImportArchiveOutcomeApplied)
	}
	if response.Mode != portableImportModeReplace {
		t.Fatalf("response.Mode=%q, want %q", response.Mode, portableImportModeReplace)
	}
}

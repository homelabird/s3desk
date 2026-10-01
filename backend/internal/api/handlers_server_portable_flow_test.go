package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oklog/ulid/v2"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

type stubPortableImportApplyStore struct {
	importCounts  store.PortableImportCounts
	importErr     error
	pingErr       error
	captureBundle *store.PortableExportBundle
	pingHook      func() error
}

func (s stubPortableImportApplyStore) ImportPortableEntityFilesReplaceWithRecovery(_ context.Context, _ map[string][]byte, _ string, _ store.PortableValidationOptions, capture func(store.PortableExportBundle) error) (store.PortableImportCounts, error) {
	if s.captureBundle != nil {
		if err := capture(*s.captureBundle); err != nil {
			return store.PortableImportCounts{}, err
		}
	}
	return s.importCounts, s.importErr
}

func (s stubPortableImportApplyStore) Ping(_ context.Context) error {
	if s.pingHook != nil {
		return s.pingHook()
	}
	return s.pingErr
}

func TestBuildPortableImportResponse_BlocksMissingEntityAndChecksumMismatch(t *testing.T) {
	t.Parallel()

	srv := &server{cfg: config.Config{DataDir: t.TempDir(), EncryptionKey: testEncryptionKey()}}
	manifest := models.ServerMigrationManifest{
		BundleKind:        serverBackupScopePortable,
		Format:            serverBackupBundleFormat,
		FormatVersion:     portableBackupFormatVersion,
		SchemaVersion:     portableBackupSchemaVersion,
		EncryptionEnabled: false,
		Entities: map[string]models.ServerMigrationEntityManifest{
			"profiles": {
				Count:  1,
				SHA256: "deadbeef",
			},
		},
	}
	entityFiles := map[string][]byte{
		"profiles": []byte("[]\n"),
	}

	resp := srv.buildPortableImportResponse(portableImportModeDryRun, db.BackendSQLite, manifest, entityFiles)
	if resp.Verification.EntityChecksumsVerified {
		t.Fatal("expected EntityChecksumsVerified=false")
	}
	blockers := resp.Preflight.Blockers
	if len(blockers) == 0 {
		t.Fatal("expected blockers")
	}
	if got := resp.Entities[0].Name; got != "profiles" {
		t.Fatalf("first entity = %q, want profiles", got)
	}
}

func TestBuildPortableImportResponseRejectsLocalhostPortableEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	srv := &server{cfg: config.Config{DataDir: t.TempDir(), EncryptionKey: testEncryptionKey(), AllowRemote: true}}
	profileData := []byte(`{"ID":"` + ulid.Make().String() + `","Name":"local-minio","Provider":"s3_compatible","ConfigJSON":"{}","SecretsJSON":"{}","Endpoint":"http://localhost:9000","Region":"us-east-1","AccessKeyID":"access-key","SecretAccessKey":"secret-key","CreatedAt":"2026-05-19T00:00:00Z","UpdatedAt":"2026-05-19T00:00:00Z"}` + "\n")
	sum := sha256.Sum256(profileData)
	manifest := models.ServerMigrationManifest{
		BundleKind:        serverBackupScopePortable,
		Format:            serverBackupBundleFormat,
		FormatVersion:     portableBackupFormatVersion,
		SchemaVersion:     portableBackupSchemaVersion,
		EncryptionEnabled: false,
		Entities: map[string]models.ServerMigrationEntityManifest{
			"profiles": {
				Count:  1,
				SHA256: hex.EncodeToString(sum[:]),
			},
		},
	}
	entityFiles := map[string][]byte{"profiles": profileData}

	resp := srv.buildPortableImportResponse(portableImportModeDryRun, db.BackendSQLite, manifest, entityFiles)
	blockers := strings.Join(resp.Preflight.Blockers, "\n")
	if !strings.Contains(blockers, "must not target localhost") {
		t.Fatalf("blockers=%v, want localhost endpoint rejection", resp.Preflight.Blockers)
	}
}

func TestPortableImportPreflightService_BlocksInsufficientThumbnailDiskSpace(t *testing.T) {
	t.Parallel()

	entityFiles := make(map[string][]byte, len(portableEntityOrder))
	entities := make(map[string]models.ServerMigrationEntityManifest, len(portableEntityOrder))
	for _, name := range portableEntityOrder {
		data := []byte("[]\n")
		sum := sha256.Sum256(data)
		entityFiles[name] = data
		entities[name] = models.ServerMigrationEntityManifest{
			Count:  0,
			SHA256: hex.EncodeToString(sum[:]),
		}
	}

	svc := newPortableImportPreflightService(t.TempDir(), testEncryptionKey())
	svc.diskCheck = func(_ string) (int64, error) {
		return 32, nil
	}

	resp := svc.buildResponse(portableImportModeDryRun, db.BackendSQLite, models.ServerMigrationManifest{
		BundleKind:    serverBackupScopePortable,
		Format:        serverBackupBundleFormat,
		FormatVersion: portableBackupFormatVersion,
		SchemaVersion: portableBackupSchemaVersion,
		Entities:      entities,
		Assets: map[string]models.ServerMigrationAssetManifest{
			portableAssetKeyThumbnails: {Bytes: 128},
		},
	}, entityFiles)

	if resp.Preflight.SpaceReady {
		t.Fatal("expected SpaceReady=false")
	}
	if !strings.Contains(strings.Join(resp.Preflight.Blockers, "\n"), "Need 128 bytes free for thumbnail assets, only 32 available.") {
		t.Fatalf("expected disk-space blocker, got %v", resp.Preflight.Blockers)
	}
}

func TestApplyPortableImportPayload_CopiesThumbnailsAndMarksHealthCheck(t *testing.T) {
	t.Parallel()

	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	srv := &server{
		cfg: config.Config{
			DataDir:       dataDir,
			DBBackend:     string(db.BackendSQLite),
			EncryptionKey: testEncryptionKey(),
		},
		store: st,
	}
	profile := createTestProfile(t, st)
	exportBundle, err := st.ExportPortableEntityFiles(context.Background())
	if err != nil {
		t.Fatalf("ExportPortableEntityFiles() error = %v", err)
	}
	entityFiles := make(map[string][]byte, len(exportBundle.EntityFiles))
	manifestEntities := make(map[string]models.ServerMigrationEntityManifest, len(exportBundle.EntityFiles))
	for name, file := range exportBundle.EntityFiles {
		entityFiles[name] = file.Data
		manifestEntities[name] = models.ServerMigrationEntityManifest{
			Count:  file.Count,
			SHA256: file.SHA256,
		}
	}

	assetRoot := filepath.Join(t.TempDir(), "assets")
	thumbPath := filepath.Join(assetRoot, portableAssetKeyThumbnails, profile.ID, "bucket-a", "thumb.jpg")
	if err := os.MkdirAll(filepath.Dir(thumbPath), 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(thumbPath, []byte("thumb"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	resp := srv.buildPortableImportResponse(portableImportModeReplace, db.BackendSQLite, models.ServerMigrationManifest{
		BundleKind:    serverBackupScopePortable,
		Format:        serverBackupBundleFormat,
		FormatVersion: portableBackupFormatVersion,
		SchemaVersion: portableBackupSchemaVersion,
		Entities:      manifestEntities,
	}, entityFiles)

	if err := srv.applyPortableImportPayload(context.Background(), &resp, entityFiles, assetRoot); err != nil {
		t.Fatalf("applyPortableImportPayload() error = %v", err)
	}
	if !resp.Verification.PostImportHealthCheckPassed {
		t.Fatal("expected PostImportHealthCheckPassed=true")
	}
	if resp.AssetStagingDir == "" {
		t.Fatal("expected AssetStagingDir to be set")
	}
	if resp.Status != "complete" {
		t.Fatalf("status=%q, want complete", resp.Status)
	}
	if data, err := os.ReadFile(thumbPath); err != nil || string(data) != "thumb" {
		t.Fatal("import must copy from the extraction tree, not move it")
	}
	if paths, err := filepath.Glob(filepath.Join(dataDir, ".portable-thumbnails-*")); err != nil || len(paths) != 0 {
		t.Fatalf("prepared thumbnail workspace not cleaned up: %v, %v", paths, err)
	}
}

func TestFinalizePortableImportResponse_AddsMismatchWarning(t *testing.T) {
	t.Parallel()

	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	resp := &models.ServerPortableImportResponse{
		Entities: []models.ServerPortableImportEntityResult{
			{Name: "profiles", ExportedCount: 2, ImportedCount: 1, ChecksumVerified: true},
		},
	}

	newPortableImportApplyService(st, dataDir).finalizeResponse(context.Background(), resp)

	if !resp.Verification.PostImportHealthCheckPassed {
		t.Fatal("expected PostImportHealthCheckPassed=true")
	}
	if !strings.Contains(strings.Join(resp.Warnings, "\n"), "Imported row counts did not match") {
		t.Fatalf("expected mismatch warning, got %v", resp.Warnings)
	}
	if resp.Status != "partial" {
		t.Fatalf("status=%q, want partial", resp.Status)
	}
}

func TestPortableThumbnailSwapRestoresPreviousTreeOnFailure(t *testing.T) {
	dataDir := t.TempDir()
	previousFile := filepath.Join(dataDir, "thumbnails", "old.jpg")
	if err := os.MkdirAll(filepath.Dir(previousFile), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(previousFile, []byte("previous"), 0o600); err != nil {
		t.Fatal(err)
	}
	preparedRoot, err := os.MkdirTemp(dataDir, ".portable-thumbnails-*")
	if err != nil {
		t.Fatal(err)
	}
	// Simulate the prepared tree becoming unavailable after the database commit.
	resp := &models.ServerPortableImportResponse{Status: "complete"}
	newPortableImportApplyService(nil, dataDir).applyAssets(resp, preparedRoot)
	if resp.Status != "partial" || len(resp.Warnings) == 0 {
		t.Fatal("asset failure was reported as complete")
	}
	if data, err := os.ReadFile(previousFile); err != nil || string(data) != "previous" {
		t.Fatal("previous tree was not restored")
	}
}

func TestPortableImportApplyService_FinalizeResponse_AddsHealthCheckWarning(t *testing.T) {
	t.Parallel()

	resp := &models.ServerPortableImportResponse{
		Entities: []models.ServerPortableImportEntityResult{
			{Name: "profiles", ExportedCount: 1, ImportedCount: 1, ChecksumVerified: true},
		},
	}

	svc := newPortableImportApplyService(stubPortableImportApplyStore{
		pingErr: errors.New("db unavailable"),
	}, t.TempDir())
	svc.finalizeResponse(context.Background(), resp)

	if resp.Verification.PostImportHealthCheckPassed {
		t.Fatal("expected PostImportHealthCheckPassed=false")
	}
	if !strings.Contains(strings.Join(resp.Warnings, "\n"), "post-import health check failed") {
		t.Fatalf("expected post-import health check warning, got %v", resp.Warnings)
	}
}

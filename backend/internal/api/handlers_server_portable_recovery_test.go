package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestPortableRecoveryBundleRestoresPreviousDestination(t *testing.T) {
	for _, key := range []string{"", testEncryptionKey()} {
		t.Run(map[bool]string{true: "encrypted", false: "unsigned"}[key != ""], func(t *testing.T) {
			source, _, _, _ := newTestJobsServer(t, key, false)
			incoming := createTestProfile(t, source)
			bundle, err := source.ExportPortableEntityFiles(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			files := map[string][]byte{}
			entities := map[string]models.ServerMigrationEntityManifest{}
			for name, file := range bundle.EntityFiles {
				files[name] = file.Data
				entities[name] = models.ServerMigrationEntityManifest{Count: file.Count, SHA256: file.SHA256}
			}
			target, _, _, dataDir := newTestJobsServer(t, key, false)
			original := createTestProfile(t, target)
			oldThumb := filepath.Join(dataDir, "thumbnails", "old.jpg")
			if err := os.MkdirAll(filepath.Dir(oldThumb), 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(oldThumb, []byte("previous thumbnail"), 0o600); err != nil {
				t.Fatal(err)
			}
			assets := filepath.Join(t.TempDir(), "assets")
			if err := os.MkdirAll(filepath.Join(assets, "thumbnails"), 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(assets, "thumbnails", "new.jpg"), []byte("incoming thumbnail"), 0o600); err != nil {
				t.Fatal(err)
			}
			srv := &server{store: target, cfg: config.Config{DataDir: dataDir, DBBackend: "sqlite", EncryptionKey: key}}
			manifest := models.ServerMigrationManifest{Format: serverBackupBundleFormat, BundleKind: serverBackupScopePortable, FormatVersion: portableBackupFormatVersion, SchemaVersion: portableBackupSchemaVersion, Entities: entities}
			resp := srv.buildPortableImportResponse(portableImportModeReplace, db.BackendSQLite, manifest, files)
			if err := srv.applyPortableImportPayload(t.Context(), &resp, files, assets); err != nil {
				t.Fatal(err)
			}
			if resp.Status != "complete" || resp.RecoveryBundlePath == "" {
				t.Fatalf("missing complete recovery: %+v", resp)
			}
			data, err := os.ReadFile(filepath.Join(resp.RecoveryDir, "operation.json"))
			if err != nil {
				t.Fatal(err)
			}
			var record portableImportRecoveryRecord
			if err := json.Unmarshal(data, &record); err != nil {
				t.Fatal(err)
			}
			if record.Phase != "complete" || record.Result == nil || record.Result.Status != "complete" {
				t.Fatalf("record=%+v", record)
			}
			for _, path := range []string{resp.RecoveryBundlePath, filepath.Join(resp.RecoveryDir, "operation.json")} {
				info, err := os.Stat(path)
				if err != nil || info.Mode().Perm() != 0o600 {
					t.Fatalf("private recovery file permissions: %v", err)
				}
			}
			// Read the actual durable backup through the normal import parser.
			file, err := os.Open(resp.RecoveryBundlePath)
			if err != nil {
				t.Fatal(err)
			}
			extracted, beforeManifest, beforeFiles, beforeAssets, _, err := extractPortableArchiveWithLimit(t.Context(), file, "", key, 0, key == "")
			file.Close()
			if err != nil {
				t.Fatal(err)
			}
			defer os.RemoveAll(extracted)
			if key != "" && beforeManifest.ConfidentialityMode != serverBackupConfidentialityEncrypted {
				t.Fatal("recovery credentials were not encrypted")
			}
			rollback := srv.buildPortableImportResponse(portableImportModeReplace, db.BackendSQLite, beforeManifest, beforeFiles)
			if err := srv.applyPortableImportPayload(t.Context(), &rollback, beforeFiles, beforeAssets); err != nil {
				t.Fatal(err)
			}
			if rollback.Status != "complete" || rollback.RecoveryDir == resp.RecoveryDir {
				t.Fatal("rollback did not retain a separate recovery operation")
			}
			if _, ok, err := target.GetProfile(t.Context(), original.ID); err != nil || !ok {
				t.Fatal("old destination profile was not restored")
			}
			if _, ok, err := target.GetProfile(t.Context(), incoming.ID); err != nil || ok {
				t.Fatal("incoming profile remained after rollback")
			}
			if data, err := os.ReadFile(oldThumb); err != nil || string(data) != "previous thumbnail" {
				t.Fatal("old thumbnails were not restored")
			}
		})
	}
}

func TestPortableRecoveryDirectoryFailurePreservesDestination(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	original := createTestProfile(t, st)
	if err := os.WriteFile(filepath.Join(dataDir, "import-recovery"), []byte("blocks recovery directory"), 0o600); err != nil {
		t.Fatal(err)
	}
	srv := &server{store: st, cfg: config.Config{DataDir: dataDir, DBBackend: "sqlite", EncryptionKey: testEncryptionKey()}}
	resp := models.ServerPortableImportResponse{}
	if err := srv.applyPortableImportPayload(t.Context(), &resp, map[string][]byte{}, ""); err == nil {
		t.Fatal("import without recovery succeeded")
	}
	if _, ok, err := st.GetProfile(t.Context(), original.ID); err != nil || !ok {
		t.Fatal("failed recovery changed destination")
	}
}

func TestPortableRecoveryArchiveFailurePreservesDestination(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	original := createTestProfile(t, st)
	srv := &server{store: st, cfg: config.Config{DataDir: dataDir, DBBackend: "sqlite", EncryptionKey: testEncryptionKey(), ServerRestoreMaxBytes: 1}}
	resp := models.ServerPortableImportResponse{}
	if err := srv.applyPortableImportPayload(t.Context(), &resp, map[string][]byte{}, ""); err == nil {
		t.Fatal("import succeeded after recovery export failed its size limit")
	}
	if _, ok, err := st.GetProfile(t.Context(), original.ID); err != nil || !ok {
		t.Fatal("failed recovery archive changed destination")
	}
	entries, err := os.ReadDir(filepath.Join(dataDir, "import-recovery"))
	if err != nil || len(entries) != 0 {
		t.Fatal("incomplete recovery archive retained as an operation")
	}
}

func TestPortableRecoveryRetainsUncertainAndPartialResults(t *testing.T) {
	for _, failure := range []string{"commit", "health", "final_record"} {
		t.Run(failure, func(t *testing.T) {
			st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
			createTestProfile(t, st)
			bundle, err := st.ExportPortableEntityFiles(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			fake := stubPortableImportApplyStore{captureBundle: &bundle, importCounts: store.PortableImportCounts{Profiles: 1}}
			var operationDir string
			switch failure {
			case "commit":
				fake.importErr = errors.New("commit confirmation unavailable")
			case "health":
				fake.pingErr = errors.New("health unavailable")
			case "final_record":
				fake.pingHook = func() error {
					path := filepath.Join(operationDir, "operation.json")
					if err := os.Rename(path, filepath.Join(operationDir, "intermediate.json")); err != nil {
						return err
					}
					return os.Mkdir(path, 0o700) // Force the terminal record rename to fail after commit.
				}
			}
			svc := newPortableImportApplyService(fake, dataDir)
			srv := &server{cfg: config.Config{DataDir: dataDir, DBBackend: "sqlite", EncryptionKey: testEncryptionKey()}}
			svc.writeRecoveryBundle = func(ctx context.Context, path string, before store.PortableExportBundle) error {
				operationDir = filepath.Dir(path)
				secrets, err := resolveServerBackupExportSecrets(serverBackupConfidentialityEncrypted, "", testEncryptionKey())
				if err != nil {
					return err
				}
				_, err = srv.writePortableServerBackupArchiveFromBundle(ctx, path, serverBackupConfidentialityEncrypted, true, secrets, before)
				return err
			}
			resp := models.ServerPortableImportResponse{Entities: []models.ServerPortableImportEntityResult{{Name: "profiles", ExportedCount: 1}}}
			err = svc.apply(t.Context(), &resp, nil, "")
			if (err != nil) != (failure == "commit") {
				t.Fatalf("apply error=%v", err)
			}
			path := filepath.Join(operationDir, "operation.json")
			wantPhase := "partial"
			if failure == "commit" {
				wantPhase = "commit_unknown"
			}
			if failure == "final_record" {
				path = filepath.Join(operationDir, "intermediate.json")
				wantPhase = "database_committed"
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var record portableImportRecoveryRecord
			if err := json.Unmarshal(data, &record); err != nil {
				t.Fatal(err)
			}
			if record.Phase != wantPhase {
				t.Fatalf("phase=%q want %q", record.Phase, wantPhase)
			}
			if failure != "commit" && (resp.Status != "partial" || len(resp.Warnings) == 0) {
				t.Fatal("post-commit failure appeared complete")
			}
			if _, err := os.Stat(record.RecoveryBundlePath); err != nil {
				t.Fatal("pre-import recovery bundle lost")
			}
		})
	}
}

func TestPortableDestinationLocalUploadsReturnConflict(t *testing.T) {
	response := httptest.NewRecorder()
	writePortableImportError(response, store.ErrPortableImportLocalUploads)
	if response.Code != http.StatusConflict {
		t.Fatalf("status=%d want conflict", response.Code)
	}
}

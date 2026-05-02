package api

import (
	"testing"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

func TestBuildPortableImportResponseBody_MapsPortableImportHTTPShape(t *testing.T) {
	t.Parallel()

	manifest := models.ServerMigrationManifest{
		BundleKind:    serverBackupScopePortable,
		Format:        serverBackupBundleFormat,
		FormatVersion: portableBackupFormatVersion,
		SchemaVersion: portableBackupSchemaVersion,
	}
	preflight := models.ServerPortableImportPreflight{
		SchemaReady:               true,
		EncryptionReady:           true,
		EncryptionKeyHintVerified: true,
		SpaceReady:                false,
		Blockers:                  []string{"insufficient disk"},
	}
	entityVerification := portableImportEntityVerification{
		results: []models.ServerPortableImportEntityResult{
			{Name: "profiles", ExportedCount: 1, ChecksumVerified: true},
		},
		entityChecksumsVerified: true,
	}

	resp := buildPortableImportResponseBody(
		portableImportModeReplace,
		db.BackendSQLite,
		manifest,
		preflight,
		entityVerification,
	)

	if resp.Mode != portableImportModeReplace {
		t.Fatalf("Mode=%q, want %q", resp.Mode, portableImportModeReplace)
	}
	if resp.TargetDBBackend != string(db.BackendSQLite) {
		t.Fatalf("TargetDBBackend=%q, want %q", resp.TargetDBBackend, db.BackendSQLite)
	}
	if !resp.Preflight.SchemaReady || resp.Preflight.SpaceReady {
		t.Fatalf("Preflight=%#v, want schema ready and space blocked", resp.Preflight)
	}
	if len(resp.Entities) != 1 || resp.Entities[0].Name != "profiles" {
		t.Fatalf("Entities=%#v, want profiles entity", resp.Entities)
	}
	if !resp.Verification.EntityChecksumsVerified {
		t.Fatal("expected EntityChecksumsVerified=true")
	}
	if resp.Verification.PostImportHealthCheckPassed {
		t.Fatal("expected PostImportHealthCheckPassed=false before apply")
	}
}

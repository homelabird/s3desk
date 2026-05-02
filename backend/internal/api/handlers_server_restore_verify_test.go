package api

import (
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestVerifyServerRestorePayloadSuccess(t *testing.T) {
	t.Parallel()

	payloadEntries := []serverBackupPayloadEntry{
		{ArchivePath: "data/s3desk.db", Size: 32, SHA256: strings.Repeat("a", 64)},
	}
	fileCount, payloadBytes, payloadSHA256 := buildServerBackupPayloadSummary(payloadEntries)
	manifest := models.ServerMigrationManifest{
		Format:           serverBackupBundleFormat,
		BundleKind:       serverBackupScopeFull,
		DBBackend:        "sqlite",
		PayloadFileCount: fileCount,
		PayloadBytes:     payloadBytes,
		PayloadSHA256:    payloadSHA256,
	}
	archiveManifest := serverBackupArchiveManifest{
		ServerMigrationManifest: manifest,
		PayloadHMACSHA256:       buildServerBackupPayloadHMAC(manifest, "local-secret", ""),
	}

	verification, err := verifyServerRestorePayload("backup", manifest, archiveManifest, payloadEntries, "", "local-secret")
	if err != nil {
		t.Fatalf("verifyServerRestorePayload() error = %v", err)
	}
	if !verification.ChecksumPresent || !verification.ChecksumVerified {
		t.Fatalf("checksum verification = %+v, want present+verified", verification)
	}
	if !verification.SignaturePresent || !verification.SignatureVerified {
		t.Fatalf("signature verification = %+v, want present+verified", verification)
	}
}

func TestVerifyServerRestorePayloadMismatch(t *testing.T) {
	t.Parallel()

	payloadEntries := []serverBackupPayloadEntry{
		{ArchivePath: "data/jobs.jsonl", Size: 8, SHA256: strings.Repeat("b", 64)},
	}
	manifest := models.ServerMigrationManifest{
		Format:           serverBackupBundleFormat,
		BundleKind:       serverBackupScopePortable,
		DBBackend:        "sqlite",
		PayloadFileCount: 1,
		PayloadBytes:     8,
		PayloadSHA256:    strings.Repeat("c", 64),
	}

	_, err := verifyServerRestorePayload("portable", manifest, serverBackupArchiveManifest{ServerMigrationManifest: manifest}, payloadEntries, "", "")
	if err == nil || !strings.Contains(err.Error(), "portable payload checksum mismatch") {
		t.Fatalf("verifyServerRestorePayload() error = %v, want portable payload checksum mismatch", err)
	}
}

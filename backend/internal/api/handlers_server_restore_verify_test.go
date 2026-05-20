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
	}
	archiveManifest.PayloadHMACSHA256 = buildServerBackupPayloadHMAC(archiveManifest, "local-secret")

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

func TestBuildServerBackupPayloadHMACIncludesEncryptionMetadata(t *testing.T) {
	t.Parallel()

	manifest := models.ServerMigrationManifest{
		Format:              serverBackupBundleFormat,
		BundleKind:          serverBackupScopeFull,
		DBBackend:           "sqlite",
		ConfidentialityMode: serverBackupConfidentialityEncrypted,
		PayloadFileCount:    1,
		PayloadBytes:        32,
		PayloadSHA256:       strings.Repeat("a", 64),
	}
	archiveManifest := serverBackupArchiveManifest{
		ServerMigrationManifest:    manifest,
		PayloadEncryptionVersion:   serverBackupPayloadEncryptionV2,
		PayloadEncryptionCipher:    serverBackupPayloadCipherV2,
		PayloadEncryptionKDF:       serverBackupPayloadKDFV2,
		PayloadEncryptionKDFIters:  serverBackupPayloadKDFIterationsV2,
		PayloadEncryptionSalt:      strings.Repeat("1", serverBackupPayloadSaltBytesV2*2),
		PayloadEncryptionNonce:     strings.Repeat("2", serverBackupPayloadNonceBytesV2*2),
		PayloadEncryptionChunkSize: serverBackupPayloadChunkBytesV2,
	}

	first := buildServerBackupPayloadHMAC(archiveManifest, "local-secret")
	archiveManifest.PayloadEncryptionNonce = strings.Repeat("3", serverBackupPayloadNonceBytesV2*2)
	second := buildServerBackupPayloadHMAC(archiveManifest, "local-secret")

	if first == "" || second == "" {
		t.Fatal("expected non-empty payload HMACs")
	}
	if first == second {
		t.Fatal("payload HMAC did not change after encryption metadata changed")
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

func TestVerifyPortablePayloadRequiresSummary(t *testing.T) {
	t.Parallel()

	payloadEntries := []serverBackupPayloadEntry{
		{ArchivePath: "assets/thumbnails/profile/bucket/thumb.jpg", Size: 5, SHA256: strings.Repeat("d", 64)},
	}
	manifest := models.ServerMigrationManifest{
		Format:        serverBackupBundleFormat,
		BundleKind:    serverBackupScopePortable,
		FormatVersion: portableBackupFormatVersion,
		DBBackend:     "sqlite",
	}

	_, err := verifyServerRestorePayload("portable", manifest, serverBackupArchiveManifest{ServerMigrationManifest: manifest}, payloadEntries, "", "")
	if err == nil || !strings.Contains(err.Error(), "portable payload checksum is required") {
		t.Fatalf("verifyServerRestorePayload() error = %v, want required portable checksum", err)
	}
}

func TestVerifyPortableAssetManifestRejectsMismatchedThumbnailSummary(t *testing.T) {
	t.Parallel()

	payloadEntries := []serverBackupPayloadEntry{
		{ArchivePath: "assets/thumbnails/profile/bucket/thumb.jpg", Size: 5, SHA256: strings.Repeat("d", 64)},
	}
	manifest := models.ServerMigrationManifest{
		Assets: map[string]models.ServerMigrationAssetManifest{
			portableAssetKeyThumbnails: {
				FileCount: 1,
				Bytes:     5,
				SHA256:    strings.Repeat("e", 64),
			},
		},
	}

	err := verifyPortableAssetManifest(manifest, payloadEntries)
	if err == nil || !strings.Contains(err.Error(), "portable thumbnail asset checksum mismatch") {
		t.Fatalf("verifyPortableAssetManifest() error = %v, want thumbnail checksum mismatch", err)
	}
}

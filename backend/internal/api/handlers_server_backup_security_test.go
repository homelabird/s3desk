package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/models"
)

func TestBackupRejectsCorruptionAfterTarEOF(t *testing.T) {
	_, _, source, _ := newTestJobsServer(t, testEncryptionKey(), false)
	for _, scope := range []string{serverBackupScopeFull, serverBackupScopePortable} {
		for _, encrypted := range []bool{false, true} {
			t.Run(scope+fmt.Sprint(encrypted), func(t *testing.T) {
				endpoint := "/api/v1/server/backup?scope=" + scope
				password := ""
				if encrypted {
					endpoint += "&confidentiality=encrypted"
					password = "synthetic-password"
				}
				archive := downloadBackupArchiveBytesWithPassword(t, source.URL, endpoint, password)
				if encrypted {
					archive = mutateServerBackupArchive(t, archive, func(_ *serverBackupArchiveManifest, entries map[string][]byte) {
						// A complete frame with an invalid GCM tag after the inner TAR EOF.
						entries["payload.enc"] = append(entries["payload.enc"], append([]byte{0, 0, 0, 16}, make([]byte, 16)...)...)
					})
				} else {
					archive[len(archive)-8] ^= 1 // Corrupt only the gzip CRC, after TAR EOF.
				}
				var err error
				if scope == serverBackupScopeFull {
					srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
					_, err = srv.restoreServerBackupArchive(t.Context(), bytes.NewReader(archive), password, testEncryptionKey())
				} else {
					_, _, _, _, _, err = extractPortableArchiveWithLimit(t.Context(), bytes.NewReader(archive), password, testEncryptionKey(), 0, false)
				}
				if err == nil {
					t.Fatal("archive corruption after TAR EOF was accepted")
				}
				if encrypted && !strings.Contains(err.Error(), "authentication failed") {
					t.Fatalf("trailing encrypted frame did not reach authentication: %v", err)
				}
			})
		}
	}
}

func TestBackupArchiveTailIsBoundedAndAllowsTarPadding(t *testing.T) {
	for _, tc := range []struct {
		data  []byte
		valid bool
	}{
		{make([]byte, 1024), true}, {[]byte{1}, false}, {make([]byte, (1<<20)+1), false},
	} {
		if err := finishServerBackupArchive(t.Context(), bytes.NewReader(tc.data)); (err == nil) != tc.valid {
			t.Fatalf("tail length=%d valid=%v error=%v", len(tc.data), tc.valid, err)
		}
	}
}

func TestBackupExportRejectsPayloadAboveRestoreLimit(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)
	srv := &server{store: st, cfg: config.Config{
		DataDir: dataDir, DBBackend: "sqlite", EncryptionKey: testEncryptionKey(), ServerRestoreMaxBytes: 1,
	}}
	for _, scope := range []string{serverBackupScopeFull, serverBackupScopeCacheMetadata, serverBackupScopePortable} {
		for _, confidentiality := range []string{serverBackupConfidentialityClear, serverBackupConfidentialityEncrypted} {
			t.Run(scope+"/"+confidentiality, func(t *testing.T) {
				secrets, err := resolveServerBackupExportSecrets(confidentiality, "", testEncryptionKey())
				if err != nil {
					t.Fatal(err)
				}
				_, err = srv.writeServerBackupArchive(t.Context(), filepath.Join(t.TempDir(), "backup.tar.gz"), scope, confidentiality, false, secrets)
				var sizeErr *serverBackupPreparationError
				if !errors.As(err, &sizeErr) || sizeErr.status != http.StatusRequestEntityTooLarge {
					t.Fatalf("export error=%v, want restore-limit rejection", err)
				}
			})
		}
	}
}

func TestRestoreRejectsSignedInvalidSQLiteAndCleansStaging(t *testing.T) {
	files := map[string][]byte{"data/s3desk.db": []byte("synthetic invalid database")}
	manifest := serverBackupArchiveManifest{ServerMigrationManifest: models.ServerMigrationManifest{
		Format: serverBackupBundleFormat, BundleKind: serverBackupScopeFull, DBBackend: "sqlite",
	}}
	updateServerBackupArchivePayloadSummary(&manifest, files)
	manifest.PayloadHMACSHA256 = buildServerBackupPayloadHMAC(manifest, "synthetic-key")
	files["manifest.json"] = mustJSON(t, manifest)
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	if _, err := srv.restoreServerBackupArchive(t.Context(), bytes.NewReader(buildTarGzForRestore(t, files)), "", "synthetic-key"); err == nil {
		t.Fatal("invalid sqlite staged")
	}
	entries, err := os.ReadDir(filepath.Join(srv.cfg.DataDir, "restores"))
	if err != nil || len(entries) != 0 {
		t.Fatal("failed restore left staging data")
	}
}

func TestSnapshotRestoreAcceptsLegacyV2EncryptedBundle(t *testing.T) {
	_, _, source, _ := newTestJobsServer(t, testEncryptionKey(), false)
	archive := downloadBackupArchiveBytesWithPassword(t, source.URL, "/api/v1/server/backup?confidentiality=encrypted", "synthetic-password")
	// v2 and v3 share the payload cipher; legacy bundles authenticate the old message.
	legacy := mutateServerBackupArchive(t, archive, func(manifest *serverBackupArchiveManifest, _ map[string][]byte) {
		manifest.PayloadEncryptionVersion = serverBackupPayloadEncryptionV2
		manifest.PayloadHMACSHA256 = buildServerBackupPayloadHMAC(*manifest, "synthetic-password")
	})
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	resp, err := srv.restoreServerBackupArchive(t.Context(), bytes.NewReader(legacy), "synthetic-password", "")
	if err != nil {
		t.Fatal(err)
	}
	if !resp.Validation.PayloadSignatureVerified || !resp.Validation.SQLiteIntegrityVerified || !resp.Validation.SQLiteSchemaVerified {
		t.Fatalf("legacy bundle not fully validated: %+v", resp.Validation)
	}
}

func TestSnapshotRestoreRejectsPortableBundlesIncludingRemote(t *testing.T) {
	st, _, source, _ := newTestJobsServerWithAdvertisedBackend(t, testEncryptionKey(), false, nil, db.BackendPostgres)
	_ = createTestProfile(t, st)
	archive := downloadPortableArchiveBytes(t, source.URL, "/api/v1/server/backup?scope=portable&includeThumbnails=false")
	backupRoot := t.TempDir()
	backupPath := filepath.Join(backupRoot, "portable.tar.gz")
	if err := os.WriteFile(backupPath, archive, 0o600); err != nil {
		t.Fatal(err)
	}
	targetStore, _, target, _ := newTestJobsServerWithAdvertisedBackend(t, testEncryptionKey(), false, []string{backupRoot}, db.BackendSQLite)
	original := createTestProfile(t, targetStore)
	res := postPortableArchive(t, target.URL, "/api/v1/server/restore", archive, "portable.tar.gz")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("upload status=%d", res.StatusCode)
	}
	res.Body.Close()
	requestBody := mustJSON(t, serverRestoreTransferRequest{Location: serverBackupTransferLocation{Protocol: "nfs", Path: backupPath}})
	res, err := http.Post(target.URL+"/api/v1/server/restore/transfer", "application/json", bytes.NewReader(requestBody))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("remote status=%d", res.StatusCode)
	}
	if _, ok, err := targetStore.GetProfile(t.Context(), original.ID); err != nil || !ok {
		t.Fatal("rejected restore changed live database")
	}
}

func TestUnsignedPortableImportRequiresExplicitTrust(t *testing.T) {
	st, _, source, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	archive := downloadPortableArchiveBytes(t, source.URL, "/api/v1/server/backup?scope=portable&includeThumbnails=false")
	unsigned := mutateServerBackupArchive(t, archive, func(manifest *serverBackupArchiveManifest, entries map[string][]byte) {
		// An attacker can recompute public checksums after stripping the signature.
		original := entries["data/profiles.jsonl"]
		changed := bytes.ReplaceAll(original, []byte(profile.Name), []byte("synthetically tampered profile"))
		if bytes.Equal(original, changed) {
			t.Fatal("profile fixture was not changed")
		}
		entries["data/profiles.jsonl"] = changed
		entity := manifest.Entities["profiles"]
		hash := sha256.Sum256(changed)
		entity.SHA256 = hex.EncodeToString(hash[:])
		manifest.Entities["profiles"] = entity
		updateServerBackupArchivePayloadSummary(manifest, entries)
		manifest.PayloadHMACSHA256 = ""
	})
	targetStore, _, target, _ := newTestJobsServer(t, testEncryptionKey(), false)
	for _, endpoint := range []string{"/api/v1/server/import-portable/preview", "/api/v1/server/import-portable"} {
		res := postPortableArchive(t, target.URL, endpoint, unsigned, "unsigned.tar.gz")
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("unsigned status=%d", res.StatusCode)
		}
		res.Body.Close()
	}
	if _, ok, err := targetStore.GetProfile(t.Context(), profile.ID); err != nil || ok {
		t.Fatal("unsigned import changed destination")
	}
	// The operator can deliberately trust an unsigned bundle, but not a bad signature.
	for _, tc := range []struct {
		archive []byte
		status  int
	}{
		{unsigned, http.StatusCreated},
		{mutateServerBackupArchive(t, archive, func(m *serverBackupArchiveManifest, _ map[string][]byte) {
			m.PayloadHMACSHA256 = strings.Repeat("0", 64)
		}), http.StatusBadRequest},
	} {
		body, contentType := buildPortableArchiveMultipartBody(t, tc.archive, "bundle.tar.gz", "", true)
		res, err := http.Post(target.URL+"/api/v1/server/import-portable", contentType, body)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != tc.status {
			t.Fatalf("trusted unsigned status=%d, want %d", res.StatusCode, tc.status)
		}
		if tc.status == http.StatusCreated {
			var resp models.ServerPortableImportResponse
			if err := json.NewDecoder(res.Body).Decode(&resp); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(strings.Join(resp.Warnings, " "), "authenticity has not been verified") {
				t.Fatal("explicit trust warning missing")
			}
		}
		res.Body.Close()
	}
}

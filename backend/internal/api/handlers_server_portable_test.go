package api

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestHandleGetServerBackup_PortableArchiveIncludesEntityFiles(t *testing.T) {
	t.Parallel()

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	archiveBytes := downloadPortableArchiveBytes(t, srv.URL, "/api/v1/server/backup?scope=portable")
	entries := readTarGzEntries(t, bytes.NewReader(archiveBytes))

	if _, ok := entries["manifest.json"]; !ok {
		t.Fatalf("manifest.json missing from portable backup")
	}
	for _, name := range []string{
		"data/profiles.jsonl",
		"data/profile_connection_options.jsonl",
		"data/jobs.jsonl",
		"data/upload_sessions.jsonl",
		"data/upload_multipart_uploads.jsonl",
		"data/object_index.jsonl",
		"data/object_favorites.jsonl",
	} {
		if _, ok := entries[name]; !ok {
			t.Fatalf("%s missing from portable backup: keys=%v", name, mapKeys(entries))
		}
	}
	if _, ok := entries["data/s3desk.db"]; ok {
		t.Fatalf("portable backup must not include raw sqlite file")
	}
	if !bytes.Contains(entries["data/profiles.jsonl"], []byte(profile.ID)) {
		t.Fatalf("profiles export does not contain created profile id %q", profile.ID)
	}

	var manifest models.ServerMigrationManifest
	if err := json.Unmarshal(entries["manifest.json"], &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if manifest.BundleKind != serverBackupScopePortable {
		t.Fatalf("manifest.bundleKind=%q, want %q", manifest.BundleKind, serverBackupScopePortable)
	}
	if manifest.FormatVersion != portableBackupFormatVersion {
		t.Fatalf("manifest.formatVersion=%d, want %d", manifest.FormatVersion, portableBackupFormatVersion)
	}
	if manifest.SchemaVersion != portableBackupSchemaVersion {
		t.Fatalf("manifest.schemaVersion=%d, want %d", manifest.SchemaVersion, portableBackupSchemaVersion)
	}
	if got := manifest.Entities["profiles"].Count; got < 1 {
		t.Fatalf("manifest.entities[profiles].count=%d, want >=1", got)
	}
	if _, ok := manifest.Entities["profile_connection_options"]; !ok {
		t.Fatalf("manifest.entities[profile_connection_options] missing")
	}
}

func TestHandleGetServerBackup_PortableArchiveAllowsPostgresSourceConfig(t *testing.T) {
	t.Parallel()

	st, _, srv, _ := newTestJobsServerWithAdvertisedBackend(t, testEncryptionKey(), false, nil, db.BackendPostgres)
	profile := createTestProfile(t, st)

	archiveBytes := downloadPortableArchiveBytes(t, srv.URL, "/api/v1/server/backup?scope=portable")
	entries := readTarGzEntries(t, bytes.NewReader(archiveBytes))

	if !bytes.Contains(entries["data/profiles.jsonl"], []byte(profile.ID)) {
		t.Fatalf("profiles export does not contain created profile id %q", profile.ID)
	}

	var manifest models.ServerMigrationManifest
	if err := json.Unmarshal(entries["manifest.json"], &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if manifest.DBBackend != string(db.BackendPostgres) {
		t.Fatalf("manifest.dbBackend=%q, want %q", manifest.DBBackend, db.BackendPostgres)
	}
}

func TestHandleGetServerBackup_PortableArchiveIncludesThumbnailAssetMetadata(t *testing.T) {
	t.Parallel()

	_, _, srv, dataDir := newTestJobsServer(t, testEncryptionKey(), false)

	thumbPath := filepath.Join(dataDir, "thumbnails", "profile-a", "bucket-a", "thumb.jpg")
	if err := os.MkdirAll(filepath.Dir(thumbPath), 0o700); err != nil {
		t.Fatalf("mkdir thumbnails: %v", err)
	}
	if err := os.WriteFile(thumbPath, []byte("jpeg"), 0o600); err != nil {
		t.Fatalf("write thumbnail: %v", err)
	}

	archiveBytes := downloadPortableArchiveBytes(t, srv.URL, "/api/v1/server/backup?scope=portable&includeThumbnails=true")
	entries := readTarGzEntries(t, bytes.NewReader(archiveBytes))

	var manifest models.ServerMigrationManifest
	if err := json.Unmarshal(entries["manifest.json"], &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	asset, ok := manifest.Assets[portableAssetKeyThumbnails]
	if !ok {
		t.Fatalf("thumbnail asset manifest missing")
	}
	if asset.FileCount != 1 {
		t.Fatalf("thumbnail asset fileCount=%d, want 1", asset.FileCount)
	}
	if asset.Bytes != int64(len("jpeg")) {
		t.Fatalf("thumbnail asset bytes=%d, want %d", asset.Bytes, len("jpeg"))
	}
}

func TestHandleGetServerBackup_PortableArchiveIncludesUploadState(t *testing.T) {
	t.Parallel()

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", "presigned", "", time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	if err := st.UpsertMultipartUpload(context.Background(), store.MultipartUpload{
		UploadID:   session.ID,
		ProfileID:  profile.ID,
		Path:       "multipart/large.bin",
		Bucket:     "test-bucket",
		ObjectKey:  "incoming/multipart/large.bin",
		S3UploadID: "upload-1",
		ChunkSize:  5 * 1024 * 1024,
		FileSize:   11 * 1024 * 1024,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339Nano),
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339Nano),
	}); err != nil {
		t.Fatalf("upsert multipart upload: %v", err)
	}

	archiveBytes := downloadPortableArchiveBytes(t, srv.URL, "/api/v1/server/backup?scope=portable")
	entries := readTarGzEntries(t, bytes.NewReader(archiveBytes))
	if !bytes.Contains(entries["data/upload_sessions.jsonl"], []byte(session.ID)) {
		t.Fatalf("upload_sessions export missing session %q", session.ID)
	}
	if !bytes.Contains(entries["data/upload_multipart_uploads.jsonl"], []byte("multipart/large.bin")) {
		t.Fatal("upload_multipart_uploads export missing multipart metadata")
	}

	var manifest models.ServerMigrationManifest
	if err := json.Unmarshal(entries["manifest.json"], &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if got := manifest.Entities["upload_sessions"].Count; got < 1 {
		t.Fatalf("manifest.entities[upload_sessions].count=%d, want >=1", got)
	}
	if got := manifest.Entities["upload_multipart_uploads"].Count; got < 1 {
		t.Fatalf("manifest.entities[upload_multipart_uploads].count=%d, want >=1", got)
	}
}

func TestHandlePreviewPortableImport_BlocksWhenEncryptionKeyMissing(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)

	archiveBytes := downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable")

	_, _, targetSrv, _ := newTestJobsServer(t, "", false)
	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable/preview", archiveBytes, "portable-backup.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	body, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(body), "ENCRYPTION_KEY") {
		t.Fatalf("expected preflight blocker mentioning ENCRYPTION_KEY, got: %s", string(body))
	}
}

func TestHandlePreviewPortableImport_BlocksWhenEncryptionKeyHintMismatches(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)

	archiveBytes := mutatePortableArchiveManifest(t, downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable"), func(manifest *models.ServerMigrationManifest) {
		manifest.EncryptionKeyHint = "deadbeefdeadbeef"
	})

	_, _, targetSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable/preview", archiveBytes, "portable-backup.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}

	var resp models.ServerPortableImportResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Preflight.EncryptionKeyHintVerified {
		t.Fatal("expected encryptionKeyHintVerified=false")
	}
	if !strings.Contains(strings.Join(resp.Preflight.Blockers, "\n"), "encryption fingerprint") {
		t.Fatalf("expected encryption fingerprint blocker, got %v", resp.Preflight.Blockers)
	}
}

func TestHandlePreviewPortableImport_RejectsOversizedBundle(t *testing.T) {
	t.Parallel()

	srv := &server{cfg: config.Config{ServerRestoreMaxBytes: 128}}
	body, contentType := buildPortableArchiveMultipartBody(t, bytes.Repeat([]byte("x"), 1024), "oversized.tar.gz", "")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/server/import-portable/preview", body)
	req.Header.Set("Content-Type", contentType)
	rr := httptest.NewRecorder()

	srv.handlePreviewPortableImport(rr, req)

	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusRequestEntityTooLarge, rr.Body.String())
	}
}

func TestHandlePreviewPortableImport_BlocksUnsupportedPortableVersions(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)

	archiveBytes := mutatePortableArchiveManifest(t, downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable"), func(manifest *models.ServerMigrationManifest) {
		manifest.FormatVersion = portableBackupFormatVersion + 1
		manifest.SchemaVersion = portableBackupSchemaVersion + 1
	})

	_, _, targetSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable/preview", archiveBytes, "portable-backup.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}

	var resp models.ServerPortableImportResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Preflight.SchemaReady {
		t.Fatal("expected schemaReady=false for unsupported portable versions")
	}
	if len(resp.Preflight.Blockers) < 2 {
		t.Fatalf("expected format/schema blockers, got %v", resp.Preflight.Blockers)
	}
}

func TestHandlePreviewPortableImport_DoesNotClaimPostImportHealthCheck(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)

	archiveBytes := downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable")

	_, _, targetSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable/preview", archiveBytes, "portable-backup.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}

	var resp models.ServerPortableImportResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Verification.PostImportHealthCheckPassed {
		t.Fatal("expected preview to leave postImportHealthCheckPassed=false")
	}
}

func TestHandleImportPortableBackup_RejectsOversizedBundle(t *testing.T) {
	t.Parallel()

	srv := &server{cfg: config.Config{ServerRestoreMaxBytes: 128}}
	body, contentType := buildPortableArchiveMultipartBody(t, bytes.Repeat([]byte("x"), 1024), "oversized.tar.gz", "")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/server/import-portable", body)
	req.Header.Set("Content-Type", contentType)
	rr := httptest.NewRecorder()

	srv.handleImportPortableBackup(rr, req)

	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusRequestEntityTooLarge, rr.Body.String())
	}
}

func TestHandleImportPortableBackup_ReplaceImportsProfiles(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	archiveBytes := downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable")

	_, _, targetSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable", archiveBytes, "portable-backup.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 201, got %d: %s", res.StatusCode, string(body))
	}

	profilesRes := doJSONRequest(t, targetSrv, http.MethodGet, "/api/v1/profiles", nil)
	defer profilesRes.Body.Close()
	if profilesRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(profilesRes.Body)
		t.Fatalf("expected profiles status 200, got %d: %s", profilesRes.StatusCode, string(body))
	}
	var profiles []models.Profile
	decodeJSONResponse(t, profilesRes, &profiles)
	if len(profiles) != 1 {
		t.Fatalf("imported profiles=%d, want 1", len(profiles))
	}
	if profiles[0].ID != profile.ID {
		t.Fatalf("imported profile id=%q, want %q", profiles[0].ID, profile.ID)
	}
}

func TestHandleImportPortableBackup_ReturnsBlockedPreviewWhenVersionsUnsupported(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)

	archiveBytes := mutatePortableArchiveManifest(t, downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable"), func(manifest *models.ServerMigrationManifest) {
		manifest.SchemaVersion = portableBackupSchemaVersion + 1
	})

	_, _, targetSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable", archiveBytes, "portable-backup.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}

	var resp models.ServerPortableImportResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Preflight.SchemaReady {
		t.Fatal("expected schemaReady=false for unsupported schema version")
	}
	if len(resp.Preflight.Blockers) == 0 {
		t.Fatal("expected blocker for unsupported schema version")
	}
}

func TestHandleImportPortableBackup_EncryptedBundleImportsWithMatchingKey(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	archiveBytes := downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable&confidentiality=encrypted")
	entries := readTarGzEntries(t, bytes.NewReader(archiveBytes))
	if _, ok := entries["payload.enc"]; !ok {
		t.Fatalf("encrypted portable backup must include payload.enc")
	}

	_, _, targetSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable", archiveBytes, "portable-backup-encrypted.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 201, got %d: %s", res.StatusCode, string(body))
	}

	profilesRes := doJSONRequest(t, targetSrv, http.MethodGet, "/api/v1/profiles", nil)
	defer profilesRes.Body.Close()
	if profilesRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(profilesRes.Body)
		t.Fatalf("expected profiles status 200, got %d: %s", profilesRes.StatusCode, string(body))
	}
	var profiles []models.Profile
	decodeJSONResponse(t, profilesRes, &profiles)
	if len(profiles) != 1 {
		t.Fatalf("imported profiles=%d, want 1", len(profiles))
	}
	if profiles[0].ID != profile.ID {
		t.Fatalf("imported profile id=%q, want %q", profiles[0].ID, profile.ID)
	}
}

func TestHandleImportPortableBackup_PasswordProtectedBundleImportsWithMatchingPassword(t *testing.T) {
	t.Parallel()

	st, _, sourceSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	archiveBytes := downloadPortableArchiveBytesWithPassword(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable&confidentiality=encrypted", "operator-secret")
	entries := readTarGzEntries(t, bytes.NewReader(archiveBytes))
	if _, ok := entries["payload.enc"]; !ok {
		t.Fatalf("password-protected portable backup must include payload.enc")
	}

	_, _, targetSrv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	res := postPortableArchiveWithPassword(t, targetSrv.URL, "/api/v1/server/import-portable", archiveBytes, "portable-backup-password.tar.gz", "operator-secret")
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 201, got %d: %s", res.StatusCode, string(body))
	}

	profilesRes := doJSONRequest(t, targetSrv, http.MethodGet, "/api/v1/profiles", nil)
	defer profilesRes.Body.Close()
	if profilesRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(profilesRes.Body)
		t.Fatalf("expected profiles status 200, got %d: %s", profilesRes.StatusCode, string(body))
	}
	var profiles []models.Profile
	decodeJSONResponse(t, profilesRes, &profiles)
	if len(profiles) != 1 {
		t.Fatalf("imported profiles=%d, want 1", len(profiles))
	}
	if profiles[0].ID != profile.ID {
		t.Fatalf("imported profile id=%q, want %q", profiles[0].ID, profile.ID)
	}
}

func TestHandleImportPortableBackup_WarnsWhenThumbnailCopyFails(t *testing.T) {
	t.Parallel()

	_, _, sourceSrv, sourceDataDir := newTestJobsServer(t, testEncryptionKey(), false)
	thumbPath := filepath.Join(sourceDataDir, "thumbnails", "profile-a", "bucket-a", "thumb.jpg")
	if err := os.MkdirAll(filepath.Dir(thumbPath), 0o700); err != nil {
		t.Fatalf("mkdir thumbnails: %v", err)
	}
	if err := os.WriteFile(thumbPath, []byte("jpeg"), 0o600); err != nil {
		t.Fatalf("write thumbnail: %v", err)
	}

	archiveBytes := downloadPortableArchiveBytes(t, sourceSrv.URL, "/api/v1/server/backup?scope=portable&includeThumbnails=true")

	_, _, targetSrv, targetDataDir := newTestJobsServer(t, testEncryptionKey(), false)
	targetThumbDir := filepath.Join(targetDataDir, "thumbnails")
	if err := os.MkdirAll(targetThumbDir, 0o700); err != nil {
		t.Fatalf("mkdir target thumbnails: %v", err)
	}
	if err := os.Chmod(targetThumbDir, 0o500); err != nil {
		t.Fatalf("chmod target thumbnails: %v", err)
	}
	defer func() { _ = os.Chmod(targetThumbDir, 0o700) }()

	res := postPortableArchive(t, targetSrv.URL, "/api/v1/server/import-portable", archiveBytes, "portable-backup.tar.gz")
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 201, got %d: %s", res.StatusCode, string(body))
	}

	var resp models.ServerPortableImportResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(strings.Join(resp.Warnings, "\n"), "failed to copy thumbnail assets") {
		t.Fatalf("expected thumbnail copy warning, got %v", resp.Warnings)
	}
	if resp.AssetStagingDir != "" {
		t.Fatalf("assetStagingDir=%q, want empty on copy warning", resp.AssetStagingDir)
	}
}

func TestExtractPortablePayloadEntry_RejectsOversizedFileBeforeWrite(t *testing.T) {
	t.Parallel()

	tempRoot := t.TempDir()
	freeBytes, err := availableDiskBytes(tempRoot)
	if err != nil {
		t.Fatalf("availableDiskBytes: %v", err)
	}
	if freeBytes == 0 {
		t.Skip("disk reports zero free bytes")
	}

	payloadEntries := make([]serverBackupPayloadEntry, 0, 1)
	header := &tar.Header{
		Name:     "data/profiles.jsonl",
		Typeflag: tar.TypeReg,
		Mode:     0o600,
		Size:     freeBytes + 1,
	}
	err = extractPortablePayloadEntry(context.Background(), tempRoot, "data/profiles.jsonl", header, bytes.NewReader(nil), &payloadEntries)
	var preflightErr serverRestorePreflightError
	if !errors.As(err, &preflightErr) {
		t.Fatalf("expected serverRestorePreflightError, got %v", err)
	}
	if preflightErr.Path != "data/profiles.jsonl" {
		t.Fatalf("preflight path=%q, want data/profiles.jsonl", preflightErr.Path)
	}
}

func downloadPortableArchiveBytes(t *testing.T, serverURL string, path string) []byte {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, serverURL+path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("backup request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	archiveBytes, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read archive: %v", err)
	}
	return archiveBytes
}

func downloadPortableArchiveBytesWithPassword(t *testing.T, serverURL string, path string, password string) []byte {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, serverURL+path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if password != "" {
		req.Header.Set(serverBackupPasswordHeader, password)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("backup request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	archiveBytes, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read archive: %v", err)
	}
	return archiveBytes
}

func postPortableArchive(t *testing.T, serverURL string, path string, archive []byte, filename string) *http.Response {
	t.Helper()

	body, contentType := buildPortableArchiveMultipartBody(t, archive, filename, "")
	req, err := http.NewRequest(http.MethodPost, serverURL+path, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", contentType)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post archive: %v", err)
	}
	return res
}

func postPortableArchiveWithPassword(t *testing.T, serverURL string, path string, archive []byte, filename string, password string) *http.Response {
	t.Helper()

	body, contentType := buildPortableArchiveMultipartBody(t, archive, filename, password)
	req, err := http.NewRequest(http.MethodPost, serverURL+path, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", contentType)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post archive: %v", err)
	}
	return res
}

func buildPortableArchiveMultipartBody(t *testing.T, archive []byte, filename string, password string) (*bytes.Buffer, string) {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("bundle", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(archive); err != nil {
		t.Fatalf("write archive: %v", err)
	}
	if password != "" {
		if err := writer.WriteField("password", password); err != nil {
			t.Fatalf("write password: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	return body, writer.FormDataContentType()
}

func mutatePortableArchiveManifest(t *testing.T, archiveBytes []byte, mutate func(*models.ServerMigrationManifest)) []byte {
	t.Helper()

	entries := readTarGzEntries(t, bytes.NewReader(archiveBytes))
	rawManifest, ok := entries["manifest.json"]
	if !ok {
		t.Fatal("manifest.json missing from portable archive")
	}

	var manifest serverBackupArchiveManifest
	if err := json.Unmarshal(rawManifest, &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	mutate(&manifest.ServerMigrationManifest)
	entries["manifest.json"] = mustJSON(t, manifest)
	return buildTarGzForRestore(t, entries)
}

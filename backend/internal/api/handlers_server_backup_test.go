package api

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"s3desk/internal/models"
)

func TestHandleGetServerBackup_IncludesSQLiteAndDataDirEntries(t *testing.T) {
	t.Parallel()

	st, _, srv, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)

	if err := os.WriteFile(filepath.Join(dataDir, ".s3desk.lock"), []byte("lock"), 0o600); err != nil {
		t.Fatalf("write lock file: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "thumbnails", "profile-a", "bucket-a"), 0o700); err != nil {
		t.Fatalf("mkdir thumbnails: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "thumbnails", "profile-a", "bucket-a", "thumb.jpg"), []byte("jpeg"), 0o600); err != nil {
		t.Fatalf("write thumbnail: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "logs", "jobs"), 0o700); err != nil {
		t.Fatalf("mkdir logs: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "logs", "jobs", "job-1.log"), []byte("log"), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "artifacts", "jobs"), 0o700); err != nil {
		t.Fatalf("mkdir artifacts: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "artifacts", "jobs", "job-1.zip"), []byte("zip"), 0o600); err != nil {
		t.Fatalf("write artifact: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "staging", "upload-a"), 0o700); err != nil {
		t.Fatalf("mkdir staging: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "staging", "upload-a", "part.bin"), []byte("part"), 0o600); err != nil {
		t.Fatalf("write staging file: %v", err)
	}

	res := doJSONRequest(t, srv, http.MethodGet, "/api/v1/server/backup", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 200, got %d: %s", res.StatusCode, string(body))
	}
	if got := res.Header.Get("Content-Type"); !strings.Contains(got, "application/gzip") {
		t.Fatalf("content-type=%q, want gzip", got)
	}

	entries := readTarGzEntries(t, res.Body)
	if _, ok := entries["manifest.json"]; !ok {
		t.Fatalf("manifest.json missing from backup: keys=%v", mapKeys(entries))
	}
	if _, ok := entries["data/s3desk.db"]; !ok {
		t.Fatalf("data/s3desk.db missing from backup: keys=%v", mapKeys(entries))
	}
	if got := string(entries["data/thumbnails/profile-a/bucket-a/thumb.jpg"]); got != "jpeg" {
		t.Fatalf("thumbnail=%q, want %q", got, "jpeg")
	}
	if got := string(entries["data/logs/jobs/job-1.log"]); got != "log" {
		t.Fatalf("log=%q, want %q", got, "log")
	}
	if got := string(entries["data/artifacts/jobs/job-1.zip"]); got != "zip" {
		t.Fatalf("artifact=%q, want %q", got, "zip")
	}
	if got := string(entries["data/staging/upload-a/part.bin"]); got != "part" {
		t.Fatalf("staging=%q, want %q", got, "part")
	}
	if _, ok := entries["data/.s3desk.lock"]; ok {
		t.Fatalf("lock file must not be included in backup")
	}

	var manifest models.ServerMigrationManifest
	if err := json.Unmarshal(entries["manifest.json"], &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if manifest.Format != serverMigrationBundleFormat {
		t.Fatalf("manifest.format=%q, want %q", manifest.Format, serverMigrationBundleFormat)
	}
	if manifest.DBBackend != "sqlite" {
		t.Fatalf("manifest.dbBackend=%q, want sqlite", manifest.DBBackend)
	}
	if !manifest.EncryptionEnabled {
		t.Fatalf("manifest.encryptionEnabled=false, want true")
	}
}

func TestHandleRestoreServerBackup_StagesBundleWithoutOverwritingLiveData(t *testing.T) {
	t.Parallel()

	st, _, srv, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	_ = createTestProfile(t, st)

	dbBytes, err := os.ReadFile(filepath.Join(dataDir, "s3desk.db"))
	if err != nil {
		t.Fatalf("read sqlite db: %v", err)
	}

	manifest := models.ServerMigrationManifest{
		Format:            serverMigrationBundleFormat,
		CreatedAt:         "2026-03-08T00:00:00Z",
		AppVersion:        "test",
		DBBackend:         "sqlite",
		EncryptionEnabled: true,
		Entries:           []string{"s3desk.db", "thumbnails"},
		Warnings:          []string{"use the same ENCRYPTION_KEY"},
	}
	archiveBytes := buildTarGzForRestore(t, map[string][]byte{
		"manifest.json":                        mustJSON(t, manifest),
		"data/s3desk.db":                       dbBytes,
		"data/thumbnails/profile-a/thumb.jpg":  []byte("jpeg"),
		"data/logs/jobs/migrated-job.log":      []byte("job-log"),
		"data/artifacts/jobs/migrated-job.zip": []byte("zip"),
		"data/staging/upload-a/part.bin":       []byte("part"),
	})

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("bundle", "migration-backup.tar.gz")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(archiveBytes); err != nil {
		t.Fatalf("write archive: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/server/restore", body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("restore request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 201, got %d: %s", res.StatusCode, string(respBody))
	}

	var resp models.ServerRestoreResponse
	decodeJSONResponse(t, res, &resp)
	if resp.StagingDir == "" {
		t.Fatalf("stagingDir is empty")
	}
	if !strings.HasPrefix(resp.StagingDir, filepath.Join(dataDir, "restores")+string(os.PathSeparator)) {
		t.Fatalf("stagingDir=%q, want under %q", resp.StagingDir, filepath.Join(dataDir, "restores"))
	}
	if !resp.RestartRequired {
		t.Fatalf("restartRequired=false, want true")
	}
	if resp.Manifest.Format != serverMigrationBundleFormat {
		t.Fatalf("manifest.format=%q, want %q", resp.Manifest.Format, serverMigrationBundleFormat)
	}

	if got, err := os.ReadFile(filepath.Join(resp.StagingDir, "thumbnails", "profile-a", "thumb.jpg")); err != nil || string(got) != "jpeg" {
		t.Fatalf("restored thumbnail=%q err=%v, want jpeg", string(got), err)
	}
	if got, err := os.ReadFile(filepath.Join(resp.StagingDir, "logs", "jobs", "migrated-job.log")); err != nil || string(got) != "job-log" {
		t.Fatalf("restored log=%q err=%v, want job-log", string(got), err)
	}
	if got, err := os.ReadFile(filepath.Join(resp.StagingDir, "artifacts", "jobs", "migrated-job.zip")); err != nil || string(got) != "zip" {
		t.Fatalf("restored artifact=%q err=%v, want zip", string(got), err)
	}
	if got, err := os.ReadFile(filepath.Join(resp.StagingDir, "staging", "upload-a", "part.bin")); err != nil || string(got) != "part" {
		t.Fatalf("restored staging=%q err=%v, want part", string(got), err)
	}
	if _, err := os.Stat(filepath.Join(resp.StagingDir, "manifest.json")); err != nil {
		t.Fatalf("manifest.json missing from staging dir: %v", err)
	}
	if _, err := os.Stat(filepath.Join(resp.StagingDir, "s3desk.db")); err != nil {
		t.Fatalf("s3desk.db missing from staging dir: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "thumbnails", "profile-a", "thumb.jpg")); !errorsIsNotExist(err) {
		t.Fatalf("live data dir should not be overwritten, stat err=%v", err)
	}
}

func readTarGzEntries(t *testing.T, reader io.Reader) map[string][]byte {
	t.Helper()
	gzipReader, err := gzip.NewReader(reader)
	if err != nil {
		t.Fatalf("new gzip reader: %v", err)
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)
	entries := map[string][]byte{}
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			return entries
		}
		if err != nil {
			t.Fatalf("read tar entry: %v", err)
		}
		if header.Typeflag == tar.TypeDir {
			continue
		}
		data, err := io.ReadAll(tarReader)
		if err != nil {
			t.Fatalf("read entry %s: %v", header.Name, err)
		}
		entries[header.Name] = data
	}
}

func buildTarGzForRestore(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	buf := &bytes.Buffer{}
	gzipWriter := gzip.NewWriter(buf)
	tarWriter := tar.NewWriter(gzipWriter)

	if err := writeTarDirHeader(tarWriter, "data/", time.Now().UTC()); err != nil {
		t.Fatalf("write data dir header: %v", err)
	}
	for name, data := range files {
		header := &tar.Header{
			Name:     name,
			Mode:     0o600,
			Size:     int64(len(data)),
			ModTime:  time.Now().UTC(),
			Typeflag: tar.TypeReg,
		}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatalf("write header %s: %v", name, err)
		}
		if _, err := tarWriter.Write(data); err != nil {
			t.Fatalf("write data %s: %v", name, err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar writer: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip writer: %v", err)
	}
	return buf.Bytes()
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return data
}

func mapKeys(m map[string][]byte) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	return keys
}

func errorsIsNotExist(err error) bool {
	return err != nil && os.IsNotExist(err)
}

func TestStoreCreateSQLiteBackup_ProducesReadableSnapshot(t *testing.T) {
	t.Parallel()

	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	destPath := filepath.Join(t.TempDir(), "snapshot.db")
	if err := st.CreateSQLiteBackup(context.Background(), destPath); err != nil {
		t.Fatalf("CreateSQLiteBackup: %v", err)
	}
	info, err := os.Stat(destPath)
	if err != nil {
		t.Fatalf("stat snapshot: %v", err)
	}
	if info.Size() == 0 {
		t.Fatalf("backup file invalid size: %d", info.Size())
	}
	if _, err := os.Stat(filepath.Join(dataDir, "s3desk.db")); err != nil {
		t.Fatalf("live sqlite db missing: %v", err)
	}
	if profile.ID == "" {
		t.Fatalf("profile id is empty")
	}
}

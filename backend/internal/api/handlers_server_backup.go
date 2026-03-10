package api

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/version"
)

const (
	serverBackupBundleFormat         = "s3desk-server-backup/v1"
	serverBackupScopeFull            = "full"
	serverBackupScopeCacheMetadata   = "cache_metadata"
)

var serverBackupFullDataEntries = []string{
	"thumbnails",
	"logs",
	"artifacts",
	"staging",
}

var serverBackupCacheMetadataEntries = []string{
	"thumbnails",
}

type serverBackupPayloadEntry struct {
	ArchivePath string
	Size        int64
	SHA256      string
}

func (s *server) handleGetServerBackup(w http.ResponseWriter, r *http.Request) {
	scope, err := parseServerBackupScope(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), map[string]any{
			"supportedScopes": []string{serverBackupScopeFull, serverBackupScopeCacheMetadata},
		})
		return
	}

	dbBackend, err := db.ParseBackend(s.cfg.DBBackend)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_config_invalid", "failed to resolve db backend", map[string]any{"error": err.Error()})
		return
	}
	if dbBackend != db.BackendSQLite {
		writeError(
			w,
			http.StatusConflict,
			"backup_unsupported",
			"server backup currently supports only sqlite-backed servers",
			map[string]any{"dbBackend": string(dbBackend)},
		)
		return
	}

	tmp, err := os.CreateTemp("", "s3desk-backup-*.tar.gz")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "backup_failed", "failed to create backup bundle", map[string]any{"error": err.Error()})
		return
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()
	defer func() { _ = os.Remove(tmpPath) }()

	if _, err := s.writeServerBackupArchive(r.Context(), tmpPath, scope); err != nil {
		writeError(w, http.StatusInternalServerError, "backup_failed", "failed to create backup bundle", map[string]any{"error": err.Error()})
		return
	}

	file, err := os.Open(tmpPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "backup_failed", "failed to open backup bundle", map[string]any{"error": err.Error()})
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "backup_failed", "failed to stat backup bundle", map[string]any{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("%s-%s.tar.gz", backupFilenamePrefix(scope), time.Now().UTC().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	http.ServeContent(w, r, filename, info.ModTime(), file)
}

func (s *server) handleRestoreServerBackup(w http.ResponseWriter, r *http.Request) {
	file, cleanup, err := openServerRestoreBundle(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return
	}
	defer cleanup()

	resp, err := s.restoreServerBackupArchive(r.Context(), file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "restore_failed", "failed to restore backup bundle", map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *server) writeServerBackupArchive(ctx context.Context, archivePath string, scope string) (models.ServerMigrationManifest, error) {
	now := time.Now().UTC()
	tmpDir, err := os.MkdirTemp("", "s3desk-sqlite-backup-*")
	if err != nil {
		return models.ServerMigrationManifest{}, err
	}
	defer os.RemoveAll(tmpDir)

	sqliteBackupPath := filepath.Join(tmpDir, "s3desk.db")
	if err := s.store.CreateSQLiteBackup(ctx, sqliteBackupPath); err != nil {
		return models.ServerMigrationManifest{}, err
	}

	entries := []string{"s3desk.db"}
	for _, rel := range serverBackupEntriesForScope(scope) {
		if info, statErr := os.Stat(filepath.Join(s.cfg.DataDir, rel)); statErr == nil && info.IsDir() {
			entries = append(entries, rel)
		}
	}
	manifest := models.ServerMigrationManifest{
		BundleKind:        scope,
		Format:            serverBackupBundleFormat,
		CreatedAt:         now.Format(time.RFC3339),
		AppVersion:        version.Version,
		DBBackend:         string(db.BackendSQLite),
		EncryptionEnabled: s.cfg.EncryptionKey != "",
		Entries:           entries,
		Warnings:          buildServerBackupManifestWarnings(s.cfg.EncryptionKey != "", scope),
	}

	archiveFile, err := os.Create(archivePath)
	if err != nil {
		return models.ServerMigrationManifest{}, err
	}
	defer archiveFile.Close()

	gzipWriter := gzip.NewWriter(archiveFile)
	defer gzipWriter.Close()

	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	if err := writeTarDirHeader(tarWriter, "data/", now); err != nil {
		return models.ServerMigrationManifest{}, err
	}
	payloadEntries := make([]serverBackupPayloadEntry, 0, 32)
	sqliteEntry, err := writeTarFileFromDisk(tarWriter, sqliteBackupPath, "data/s3desk.db")
	if err != nil {
		return models.ServerMigrationManifest{}, err
	}
	payloadEntries = append(payloadEntries, sqliteEntry)
	for _, rel := range serverBackupEntriesForScope(scope) {
		if err := writeTarPathTree(ctx, tarWriter, s.cfg.DataDir, rel, now, &payloadEntries); err != nil {
			return models.ServerMigrationManifest{}, err
		}
	}
	manifest.PayloadFileCount, manifest.PayloadBytes, manifest.PayloadSHA256 = buildServerBackupPayloadSummary(payloadEntries)
	if err := writeTarJSONFile(tarWriter, "manifest.json", manifest, now); err != nil {
		return models.ServerMigrationManifest{}, err
	}

	if err := tarWriter.Close(); err != nil {
		return models.ServerMigrationManifest{}, err
	}
	if err := gzipWriter.Close(); err != nil {
		return models.ServerMigrationManifest{}, err
	}
	if err := archiveFile.Close(); err != nil {
		return models.ServerMigrationManifest{}, err
	}
	return manifest, nil
}

func (s *server) restoreServerBackupArchive(ctx context.Context, src io.Reader) (models.ServerRestoreResponse, error) {
	restoreBase := filepath.Join(s.cfg.DataDir, "restores")
	if err := os.MkdirAll(restoreBase, 0o700); err != nil {
		return models.ServerRestoreResponse{}, err
	}

	restoreID := ulid.Make().String()
	tempRoot := filepath.Join(restoreBase, "."+restoreID+".tmp")
	finalRoot := filepath.Join(restoreBase, restoreID)
	if err := os.MkdirAll(tempRoot, 0o700); err != nil {
		return models.ServerRestoreResponse{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(tempRoot)
		}
	}()

	gzipReader, err := gzip.NewReader(src)
	if err != nil {
		return models.ServerRestoreResponse{}, err
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)
	var manifest models.ServerMigrationManifest
	manifestSeen := false
	sqliteSeen := false
	payloadEntries := make([]serverBackupPayloadEntry, 0, 32)

	for {
		if err := ctx.Err(); err != nil {
			return models.ServerRestoreResponse{}, err
		}
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return models.ServerRestoreResponse{}, err
		}

		entryName, err := cleanServerRestoreArchivePath(header.Name)
		if err != nil {
			return models.ServerRestoreResponse{}, err
		}

		switch {
		case entryName == "":
			continue
		case entryName == "data":
			continue
		case entryName == "manifest.json":
			data, err := io.ReadAll(io.LimitReader(tarReader, 1<<20))
			if err != nil {
				return models.ServerRestoreResponse{}, err
			}
			if err := json.Unmarshal(data, &manifest); err != nil {
				return models.ServerRestoreResponse{}, err
			}
			if manifest.Format != serverBackupBundleFormat {
				return models.ServerRestoreResponse{}, fmt.Errorf("unsupported backup format %q", manifest.Format)
			}
			if manifest.BundleKind == "" {
				manifest.BundleKind = serverBackupScopeFull
			}
			if err := os.WriteFile(filepath.Join(tempRoot, "manifest.json"), data, 0o600); err != nil {
				return models.ServerRestoreResponse{}, err
			}
			manifestSeen = true
		case strings.HasPrefix(entryName, "data/"):
			relPath := strings.TrimPrefix(entryName, "data/")
			if relPath == "" {
				continue
			}
			targetPath, err := resolveRestorePath(tempRoot, relPath)
			if err != nil {
				return models.ServerRestoreResponse{}, err
			}
			switch header.Typeflag {
			case tar.TypeDir:
				if err := os.MkdirAll(targetPath, 0o700); err != nil {
					return models.ServerRestoreResponse{}, err
				}
			case tar.TypeReg, tar.TypeRegA:
				if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
					return models.ServerRestoreResponse{}, err
				}
				out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, fs.FileMode(header.Mode)&0o777)
				if err != nil {
					return models.ServerRestoreResponse{}, err
				}
				hasher := sha256.New()
				if _, err := io.Copy(io.MultiWriter(out, hasher), tarReader); err != nil {
					_ = out.Close()
					return models.ServerRestoreResponse{}, err
				}
				if err := out.Close(); err != nil {
					return models.ServerRestoreResponse{}, err
				}
				payloadEntries = append(payloadEntries, serverBackupPayloadEntry{
					ArchivePath: entryName,
					Size:        header.Size,
					SHA256:      hex.EncodeToString(hasher.Sum(nil)),
				})
				if relPath == "s3desk.db" {
					sqliteSeen = true
				}
			case tar.TypeSymlink, tar.TypeLink:
				return models.ServerRestoreResponse{}, fmt.Errorf("archive entry %q uses an unsupported link type", header.Name)
			default:
				return models.ServerRestoreResponse{}, fmt.Errorf("archive entry %q uses unsupported type %d", header.Name, header.Typeflag)
			}
		default:
			return models.ServerRestoreResponse{}, fmt.Errorf("unexpected archive entry %q", header.Name)
		}
	}

	if !manifestSeen {
		return models.ServerRestoreResponse{}, errors.New("backup manifest is missing")
	}
	if manifest.PayloadSHA256 != "" {
		fileCount, payloadBytes, payloadSHA256 := buildServerBackupPayloadSummary(payloadEntries)
		switch {
		case manifest.PayloadFileCount != 0 && manifest.PayloadFileCount != fileCount:
			return models.ServerRestoreResponse{}, fmt.Errorf("backup payload file count mismatch: manifest=%d extracted=%d", manifest.PayloadFileCount, fileCount)
		case manifest.PayloadBytes != 0 && manifest.PayloadBytes != payloadBytes:
			return models.ServerRestoreResponse{}, fmt.Errorf("backup payload bytes mismatch: manifest=%d extracted=%d", manifest.PayloadBytes, payloadBytes)
		case !strings.EqualFold(manifest.PayloadSHA256, payloadSHA256):
			return models.ServerRestoreResponse{}, fmt.Errorf("backup payload checksum mismatch: manifest=%s extracted=%s", manifest.PayloadSHA256, payloadSHA256)
		}
	}
	if manifest.DBBackend == string(db.BackendSQLite) && !sqliteSeen {
		return models.ServerRestoreResponse{}, errors.New("sqlite database is missing from backup bundle")
	}
	if err := os.Rename(tempRoot, finalRoot); err != nil {
		return models.ServerRestoreResponse{}, err
	}
	success = true

	resp := models.ServerRestoreResponse{
		Manifest:        manifest,
		StagingDir:      finalRoot,
		RestartRequired: true,
		NextSteps:       buildServerRestoreNextSteps(finalRoot, manifest),
		ApplyPlan:       buildServerRestoreApplyPlan(finalRoot, manifest),
		HelperCommand:   buildServerRestoreHelperCommand(finalRoot, manifest),
		Warnings:        buildServerRestoreWarnings(manifest, s.cfg.EncryptionKey != ""),
	}
	return resp, nil
}

func openServerRestoreBundle(r *http.Request) (multipartFile io.ReadCloser, cleanup func(), err error) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		return nil, nil, fmt.Errorf("invalid multipart form: %w", err)
	}
	file, _, err := r.FormFile("bundle")
	if err != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		return nil, nil, errors.New("missing backup bundle file")
	}
	return file, func() {
		_ = file.Close()
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}, nil
}

func writeTarPathTree(ctx context.Context, tarWriter *tar.Writer, baseDir, rel string, now time.Time, payloadEntries *[]serverBackupPayloadEntry) error {
	root := filepath.Join(baseDir, rel)
	info, err := os.Stat(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if !info.IsDir() {
		return nil
	}
	return filepath.WalkDir(root, func(pathOnDisk string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}
		relPath, err := filepath.Rel(baseDir, pathOnDisk)
		if err != nil {
			return err
		}
		archivePath := filepath.ToSlash(filepath.Join("data", relPath))
		if info.IsDir() {
			if archivePath == "data" {
				return nil
			}
			return writeTarDirHeader(tarWriter, archivePath+"/", now)
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		payloadEntry, err := writeTarFileFromDisk(tarWriter, pathOnDisk, archivePath)
		if err != nil {
			return err
		}
		*payloadEntries = append(*payloadEntries, payloadEntry)
		return nil
	})
}

func writeTarJSONFile(tarWriter *tar.Writer, name string, value any, modTime time.Time) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	header := &tar.Header{
		Name:     name,
		Mode:     0o600,
		Size:     int64(len(data)),
		ModTime:  modTime,
		Typeflag: tar.TypeReg,
	}
	if err := tarWriter.WriteHeader(header); err != nil {
		return err
	}
	_, err = tarWriter.Write(data)
	return err
}

func writeTarDirHeader(tarWriter *tar.Writer, name string, modTime time.Time) error {
	header := &tar.Header{
		Name:     name,
		Mode:     0o700,
		ModTime:  modTime,
		Typeflag: tar.TypeDir,
	}
	return tarWriter.WriteHeader(header)
}

func writeTarFileFromDisk(tarWriter *tar.Writer, sourcePath, archivePath string) (serverBackupPayloadEntry, error) {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return serverBackupPayloadEntry{}, err
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return serverBackupPayloadEntry{}, err
	}
	defer file.Close()

	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return serverBackupPayloadEntry{}, err
	}
	header.Name = archivePath
	header.Mode = int64(info.Mode().Perm())
	if err := tarWriter.WriteHeader(header); err != nil {
		return serverBackupPayloadEntry{}, err
	}
	hasher := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tarWriter, hasher), file); err != nil {
		return serverBackupPayloadEntry{}, err
	}
	return serverBackupPayloadEntry{
		ArchivePath: archivePath,
		Size:        info.Size(),
		SHA256:      hex.EncodeToString(hasher.Sum(nil)),
	}, nil
}

func cleanServerRestoreArchivePath(name string) (string, error) {
	cleaned := path.Clean(strings.TrimPrefix(strings.TrimSpace(name), "./"))
	switch {
	case cleaned == ".", cleaned == "":
		return "", nil
	case strings.HasPrefix(cleaned, "/"):
		return "", fmt.Errorf("archive entry %q is absolute", name)
	case cleaned == "..", strings.HasPrefix(cleaned, "../"):
		return "", fmt.Errorf("archive entry %q escapes the restore root", name)
	default:
		return cleaned, nil
	}
}

func resolveRestorePath(root, rel string) (string, error) {
	target := filepath.Join(root, filepath.FromSlash(rel))
	cleanRoot := filepath.Clean(root)
	cleanTarget := filepath.Clean(target)
	if cleanTarget != cleanRoot && !strings.HasPrefix(cleanTarget, cleanRoot+string(os.PathSeparator)) {
		return "", fmt.Errorf("restore path %q escapes the staging directory", rel)
	}
	return cleanTarget, nil
}

func parseServerBackupScope(r *http.Request) (string, error) {
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	switch scope {
	case "", serverBackupScopeFull:
		return serverBackupScopeFull, nil
	case serverBackupScopeCacheMetadata:
		return serverBackupScopeCacheMetadata, nil
	default:
		return "", fmt.Errorf("unsupported backup scope %q", scope)
	}
}

func serverBackupEntriesForScope(scope string) []string {
	switch scope {
	case serverBackupScopeCacheMetadata:
		return append([]string{}, serverBackupCacheMetadataEntries...)
	default:
		return append([]string{}, serverBackupFullDataEntries...)
	}
}

func backupFilenamePrefix(scope string) string {
	switch scope {
	case serverBackupScopeCacheMetadata:
		return "s3desk-cache-metadata-backup"
	default:
		return "s3desk-full-backup"
	}
}

func buildServerBackupManifestWarnings(encryptionEnabled bool, scope string) []string {
	warnings := []string{
		"Environment config outside DATA_DIR is not included (API_TOKEN, DB_BACKEND, DATABASE_URL, ALLOWED_HOSTS, ENCRYPTION_KEY).",
	}
	if scope == serverBackupScopeCacheMetadata {
		warnings = append(warnings, "Cache + metadata backups include only the sqlite snapshot and selected cache directories such as thumbnails. Logs, artifacts, and staging data are excluded.")
	}
	if encryptionEnabled {
		warnings = append(warnings, "Encrypted profile data is included, but the destination server must use the same ENCRYPTION_KEY to read it.")
	}
	return warnings
}

func buildServerBackupPayloadSummary(entries []serverBackupPayloadEntry) (int, int64, string) {
	if len(entries) == 0 {
		return 0, 0, ""
	}
	sortedEntries := append([]serverBackupPayloadEntry(nil), entries...)
	sort.Slice(sortedEntries, func(i, j int) bool {
		return sortedEntries[i].ArchivePath < sortedEntries[j].ArchivePath
	})
	hasher := sha256.New()
	var payloadBytes int64
	for _, entry := range sortedEntries {
		payloadBytes += entry.Size
		_, _ = io.WriteString(hasher, entry.ArchivePath)
		_, _ = io.WriteString(hasher, "\t")
		_, _ = io.WriteString(hasher, fmt.Sprintf("%d", entry.Size))
		_, _ = io.WriteString(hasher, "\t")
		_, _ = io.WriteString(hasher, entry.SHA256)
		_, _ = io.WriteString(hasher, "\n")
	}
	return len(sortedEntries), payloadBytes, hex.EncodeToString(hasher.Sum(nil))
}

func buildServerRestoreNextSteps(stagingDir string, _ models.ServerMigrationManifest) []string {
	steps := []string{
		fmt.Sprintf("Review the staged restore at %s before cutover.", stagingDir),
		"Use the apply plan below when you are ready to switch the destination server to the staged restore.",
		"The running server keeps using the current DATA_DIR until you stop it and start against the staged restore.",
	}
	return steps
}

func buildServerRestoreApplyPlan(stagingDir string, manifest models.ServerMigrationManifest) []string {
	steps := []string{
		fmt.Sprintf("Stop the destination server before switching DATA_DIR to %s.", stagingDir),
		fmt.Sprintf("Start the destination server with DATA_DIR=%s and DB_BACKEND=%s.", stagingDir, manifest.DBBackend),
		"Reapply environment config such as API_TOKEN, ALLOWED_HOSTS, and other non-DATA_DIR settings on the destination server.",
	}
	if manifest.EncryptionEnabled {
		steps = append(steps, "Use the same ENCRYPTION_KEY from the source server before starting the restored instance.")
	}
	return steps
}

func buildServerRestoreHelperCommand(stagingDir string, manifest models.ServerMigrationManifest) string {
	parts := []string{
		fmt.Sprintf("DATA_DIR=%q", stagingDir),
		fmt.Sprintf("DB_BACKEND=%q", manifest.DBBackend),
	}
	if manifest.EncryptionEnabled {
		parts = append(parts, `ENCRYPTION_KEY="<same-as-source>"`)
	}
	return strings.Join(parts, " ") + " <start-command>"
}

func buildServerRestoreWarnings(manifest models.ServerMigrationManifest, destinationHasEncryptionKey bool) []string {
	warnings := append([]string{}, manifest.Warnings...)
	if manifest.EncryptionEnabled && !destinationHasEncryptionKey {
		warnings = append(warnings, "This server is currently running without ENCRYPTION_KEY, but the restored data still requires the source ENCRYPTION_KEY when you start from the staged DATA_DIR.")
	}
	return warnings
}

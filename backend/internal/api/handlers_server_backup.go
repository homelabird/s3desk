package api

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
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
	serverBackupBundleFormat             = "s3desk-server-backup/v1"
	serverBackupScopeFull                = "full"
	serverBackupScopeCacheMetadata       = "cache_metadata"
	serverBackupConfidentialityClear     = "clear"
	serverBackupConfidentialityEncrypted = "encrypted"
	serverBackupPasswordHeader           = "X-S3Desk-Backup-Password"
	serverBackupPasswordMaxBytes         = 4096
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

type serverBackupArchiveManifest struct {
	models.ServerMigrationManifest
	PayloadHMACSHA256   string `json:"payloadHmacSha256,omitempty"`
	PayloadEncryptionIV string `json:"payloadEncryptionIv,omitempty"`
}

type serverRestorePreflightError struct {
	Path           string
	RequiredBytes  int64
	AvailableBytes int64
}

func (e serverRestorePreflightError) Error() string {
	return fmt.Sprintf("restore preflight failed for %q: need %d bytes, have %d bytes", e.Path, e.RequiredBytes, e.AvailableBytes)
}

func (s *server) handleGetServerBackup(w http.ResponseWriter, r *http.Request) {
	scope, err := parseServerBackupScope(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), map[string]any{
			"supportedScopes": []string{serverBackupScopeFull, serverBackupScopeCacheMetadata, serverBackupScopePortable},
		})
		return
	}
	confidentiality, err := parseServerBackupConfidentiality(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), map[string]any{
			"supportedConfidentialityModes": []string{serverBackupConfidentialityClear, serverBackupConfidentialityEncrypted},
		})
		return
	}
	backupPassword, err := parseServerBackupPasswordHeader(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return
	}
	includeThumbnails := parsePortableBackupIncludeThumbnails(r)
	payloadSecret, err := resolveServerBackupExportSecret(confidentiality, backupPassword, s.cfg.EncryptionKey)
	if err != nil {
		writeError(w, http.StatusConflict, "backup_confidentiality_unavailable", err.Error(), nil)
		return
	}

	dbBackend, err := db.ParseBackend(s.cfg.DBBackend)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_config_invalid", "failed to resolve db backend", map[string]any{"error": err.Error()})
		return
	}
	if dbBackend != db.BackendSQLite && scope != serverBackupScopePortable {
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

	if _, err := s.writeServerBackupArchive(r.Context(), tmpPath, scope, confidentiality, includeThumbnails, payloadSecret); err != nil {
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

	filename := fmt.Sprintf("%s-%s.tar.gz", backupFilenamePrefix(scope, confidentiality), time.Now().UTC().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	http.ServeContent(w, r, filename, info.ModTime(), file)
}

func (s *server) handleRestoreServerBackup(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ServerRestoreMaxBytes > 0 {
		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.ServerRestoreMaxBytes)
	}
	file, backupPassword, cleanup, err := openServerRestoreBundle(r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "bundle_too_large", "backup bundle exceeds restore upload limit", map[string]any{
				"maxBytes": s.cfg.ServerRestoreMaxBytes,
			})
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return
	}
	defer cleanup()

	resp, err := s.restoreServerBackupArchive(r.Context(), file, resolveServerBackupImportSecret(backupPassword, s.cfg.EncryptionKey))
	if err != nil {
		var preflightErr serverRestorePreflightError
		if errors.As(err, &preflightErr) {
			writeError(w, http.StatusConflict, "restore_preflight_failed", "failed restore preflight before staging", map[string]any{
				"error":          preflightErr.Error(),
				"path":           preflightErr.Path,
				"requiredBytes":  preflightErr.RequiredBytes,
				"availableBytes": preflightErr.AvailableBytes,
			})
			return
		}
		writeError(w, http.StatusBadRequest, "restore_failed", "failed to restore backup bundle", map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *server) writeServerBackupArchive(ctx context.Context, archivePath string, scope string, confidentiality string, includeThumbnails bool, payloadSecret string) (models.ServerMigrationManifest, error) {
	if scope == serverBackupScopePortable {
		return s.writePortableServerBackupArchive(ctx, archivePath, confidentiality, includeThumbnails, payloadSecret)
	}
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
		Warnings:          buildServerBackupManifestWarnings(s.cfg.EncryptionKey != "", scope, confidentiality, backupSecretProvidedByPassword(payloadSecret, s.cfg.EncryptionKey)),
	}
	if confidentiality == serverBackupConfidentialityEncrypted {
		manifest.ConfidentialityMode = confidentiality
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

	payloadEntries := make([]serverBackupPayloadEntry, 0, 32)
	if confidentiality == serverBackupConfidentialityEncrypted {
		payloadPath := filepath.Join(tmpDir, "payload.tar")
		payloadIV, err := writeEncryptedServerBackupPayload(ctx, payloadPath, sqliteBackupPath, scope, s.cfg.DataDir, now, &payloadEntries)
		if err != nil {
			return models.ServerMigrationManifest{}, err
		}
		manifest.PayloadFileCount, manifest.PayloadBytes, manifest.PayloadSHA256 = buildServerBackupPayloadSummary(payloadEntries)
		archiveManifest := serverBackupArchiveManifest{
			ServerMigrationManifest: manifest,
			PayloadHMACSHA256:       buildServerBackupPayloadHMAC(manifest, payloadSecret, payloadIV),
			PayloadEncryptionIV:     payloadIV,
		}
		if err := writeTarJSONFile(tarWriter, "manifest.json", archiveManifest, now); err != nil {
			return models.ServerMigrationManifest{}, err
		}
		if err := writeEncryptedPayloadFile(tarWriter, payloadPath, payloadIV, payloadSecret); err != nil {
			return models.ServerMigrationManifest{}, err
		}
	} else {
		if err := writeTarDirHeader(tarWriter, "data/", now); err != nil {
			return models.ServerMigrationManifest{}, err
		}
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
		archiveManifest := serverBackupArchiveManifest{
			ServerMigrationManifest: manifest,
			PayloadHMACSHA256:       buildServerBackupPayloadHMAC(manifest, payloadSecret, ""),
		}
		if err := writeTarJSONFile(tarWriter, "manifest.json", archiveManifest, now); err != nil {
			return models.ServerMigrationManifest{}, err
		}
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

func writeEncryptedServerBackupPayload(
	ctx context.Context,
	payloadPath string,
	sqliteBackupPath string,
	scope string,
	dataDir string,
	now time.Time,
	payloadEntries *[]serverBackupPayloadEntry,
) (string, error) {
	payloadFile, err := os.Create(payloadPath)
	if err != nil {
		return "", err
	}
	payloadWriter := tar.NewWriter(payloadFile)
	if err := writeTarDirHeader(payloadWriter, "data/", now); err != nil {
		_ = payloadWriter.Close()
		_ = payloadFile.Close()
		return "", err
	}
	sqliteEntry, err := writeTarFileFromDisk(payloadWriter, sqliteBackupPath, "data/s3desk.db")
	if err != nil {
		_ = payloadWriter.Close()
		_ = payloadFile.Close()
		return "", err
	}
	*payloadEntries = append(*payloadEntries, sqliteEntry)
	for _, rel := range serverBackupEntriesForScope(scope) {
		if err := writeTarPathTree(ctx, payloadWriter, dataDir, rel, now, payloadEntries); err != nil {
			_ = payloadWriter.Close()
			_ = payloadFile.Close()
			return "", err
		}
	}
	if err := payloadWriter.Close(); err != nil {
		_ = payloadFile.Close()
		return "", err
	}
	if err := payloadFile.Close(); err != nil {
		return "", err
	}

	ivBytes := make([]byte, aes.BlockSize)
	if _, err := rand.Read(ivBytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(ivBytes), nil
}

func writeEncryptedPayloadFile(tarWriter *tar.Writer, payloadPath string, payloadIV string, encryptionKey string) error {
	ivBytes, err := hex.DecodeString(strings.TrimSpace(payloadIV))
	if err != nil {
		return err
	}
	if len(ivBytes) != aes.BlockSize {
		return fmt.Errorf("invalid payload encryption IV length %d", len(ivBytes))
	}
	payloadFile, err := os.Open(payloadPath)
	if err != nil {
		return err
	}
	defer payloadFile.Close()
	info, err := payloadFile.Stat()
	if err != nil {
		return err
	}
	header := &tar.Header{
		Name:     "payload.enc",
		Mode:     0o600,
		Size:     info.Size(),
		ModTime:  info.ModTime(),
		Typeflag: tar.TypeReg,
	}
	if err := tarWriter.WriteHeader(header); err != nil {
		return err
	}
	block, err := aes.NewCipher(deriveServerBackupCipherKey(encryptionKey))
	if err != nil {
		return err
	}
	stream := cipher.NewCTR(block, ivBytes)
	_, err = io.Copy(&cipher.StreamWriter{S: stream, W: tarWriter}, payloadFile)
	return err
}

func (s *server) restoreServerBackupArchive(ctx context.Context, src io.Reader, payloadSecret string) (models.ServerRestoreResponse, error) {
	s.restoreMu.Lock()
	defer s.restoreMu.Unlock()

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
	diskFreeBytesBefore, err := availableDiskBytes(restoreBase)
	if err != nil {
		return models.ServerRestoreResponse{}, err
	}
	validation := models.ServerRestoreValidation{
		PreflightChecked:    true,
		DiskFreeBytesBefore: diskFreeBytesBefore,
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
	var archiveManifest serverBackupArchiveManifest
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
			if err := json.Unmarshal(data, &archiveManifest); err != nil {
				return models.ServerRestoreResponse{}, err
			}
			manifest = archiveManifest.ServerMigrationManifest
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
			if strings.TrimSpace(manifest.ConfidentialityMode) == serverBackupConfidentialityEncrypted {
				return models.ServerRestoreResponse{}, errors.New("encrypted backup bundle cannot mix clear data/ entries with payload.enc")
			}
			if err := extractServerRestorePayloadEntry(ctx, tempRoot, entryName, header, tarReader, &validation, &payloadEntries, &sqliteSeen); err != nil {
				return models.ServerRestoreResponse{}, err
			}
		case entryName == "payload.enc":
			if !manifestSeen {
				return models.ServerRestoreResponse{}, errors.New("backup manifest must appear before encrypted payload")
			}
			validation.PayloadEncryptionPresent = true
			if strings.TrimSpace(manifest.ConfidentialityMode) != serverBackupConfidentialityEncrypted {
				return models.ServerRestoreResponse{}, errors.New("unexpected encrypted payload entry in clear backup bundle")
			}
			if err := extractEncryptedServerRestorePayload(ctx, tarReader, tempRoot, &validation, &payloadEntries, &sqliteSeen, archiveManifest.PayloadEncryptionIV, payloadSecret); err != nil {
				return models.ServerRestoreResponse{}, err
			}
			validation.PayloadEncryptionDecrypted = true
		default:
			return models.ServerRestoreResponse{}, fmt.Errorf("unexpected archive entry %q", header.Name)
		}
	}

	if !manifestSeen {
		return models.ServerRestoreResponse{}, errors.New("backup manifest is missing")
	}
	if strings.TrimSpace(manifest.ConfidentialityMode) == serverBackupConfidentialityEncrypted && !validation.PayloadEncryptionDecrypted {
		return models.ServerRestoreResponse{}, errors.New("encrypted backup payload is missing")
	}
	if manifest.PayloadSHA256 != "" {
		validation.PayloadChecksumPresent = true
		fileCount, payloadBytes, payloadSHA256 := buildServerBackupPayloadSummary(payloadEntries)
		switch {
		case manifest.PayloadFileCount != 0 && manifest.PayloadFileCount != fileCount:
			return models.ServerRestoreResponse{}, fmt.Errorf("backup payload file count mismatch: manifest=%d extracted=%d", manifest.PayloadFileCount, fileCount)
		case manifest.PayloadBytes != 0 && manifest.PayloadBytes != payloadBytes:
			return models.ServerRestoreResponse{}, fmt.Errorf("backup payload bytes mismatch: manifest=%d extracted=%d", manifest.PayloadBytes, payloadBytes)
		case !strings.EqualFold(manifest.PayloadSHA256, payloadSHA256):
			return models.ServerRestoreResponse{}, fmt.Errorf("backup payload checksum mismatch: manifest=%s extracted=%s", manifest.PayloadSHA256, payloadSHA256)
		}
		validation.PayloadChecksumVerified = true
	}
	if archiveManifest.PayloadHMACSHA256 != "" {
		expectedHMAC := buildServerBackupPayloadHMAC(manifest, payloadSecret, archiveManifest.PayloadEncryptionIV)
		if expectedHMAC == "" {
			validation.PayloadSignaturePresent = true
		} else if !hmac.Equal([]byte(strings.ToLower(strings.TrimSpace(archiveManifest.PayloadHMACSHA256))), []byte(expectedHMAC)) {
			return models.ServerRestoreResponse{}, errors.New("backup payload signature mismatch")
		} else {
			validation.PayloadSignaturePresent = true
			validation.PayloadSignatureVerified = true
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
		Validation:      validation,
		StagingDir:      finalRoot,
		RestartRequired: true,
		NextSteps:       buildServerRestoreNextSteps(finalRoot, manifest),
		ApplyPlan:       buildServerRestoreApplyPlan(finalRoot, manifest),
		HelperCommand:   buildServerRestoreHelperCommand(finalRoot, manifest),
		Warnings:        buildServerRestoreWarnings(manifest, validation, s.cfg.EncryptionKey != ""),
	}
	return resp, nil
}

func openServerRestoreBundle(r *http.Request) (multipartFile io.ReadCloser, bundlePassword string, cleanup func(), err error) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		return nil, "", nil, fmt.Errorf("invalid multipart form: %w", err)
	}
	password, err := sanitizeServerBackupPassword(r.FormValue("password"))
	if err != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		return nil, "", nil, err
	}
	file, _, err := r.FormFile("bundle")
	if err != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		return nil, "", nil, errors.New("missing backup bundle file")
	}
	return file, password, func() {
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

func extractServerRestorePayloadEntry(
	ctx context.Context,
	tempRoot string,
	entryName string,
	header *tar.Header,
	entryReader io.Reader,
	validation *models.ServerRestoreValidation,
	payloadEntries *[]serverBackupPayloadEntry,
	sqliteSeen *bool,
) error {
	relPath := strings.TrimPrefix(entryName, "data/")
	if relPath == "" {
		return nil
	}
	targetPath, err := resolveRestorePath(tempRoot, relPath)
	if err != nil {
		return err
	}
	switch header.Typeflag {
	case tar.TypeDir:
		return os.MkdirAll(targetPath, 0o700)
	case tar.TypeReg, tar.TypeRegA:
		freeBytes, err := availableDiskBytes(tempRoot)
		if err != nil {
			return err
		}
		if header.Size > freeBytes {
			return serverRestorePreflightError{
				Path:           relPath,
				RequiredBytes:  header.Size,
				AvailableBytes: freeBytes,
			}
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
			return err
		}
		out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, fs.FileMode(header.Mode)&0o777)
		if err != nil {
			return err
		}
		defer out.Close()
		hasher := sha256.New()
		if _, err := io.Copy(io.MultiWriter(out, hasher), entryReader); err != nil {
			return err
		}
		*payloadEntries = append(*payloadEntries, serverBackupPayloadEntry{
			ArchivePath: entryName,
			Size:        header.Size,
			SHA256:      hex.EncodeToString(hasher.Sum(nil)),
		})
		validation.PayloadFileCount++
		validation.PayloadBytes += header.Size
		if relPath == "s3desk.db" {
			*sqliteSeen = true
		}
		return nil
	case tar.TypeSymlink, tar.TypeLink:
		return fmt.Errorf("archive entry %q uses an unsupported link type", header.Name)
	default:
		return fmt.Errorf("archive entry %q uses unsupported type %d", header.Name, header.Typeflag)
	}
}

func extractEncryptedServerRestorePayload(
	ctx context.Context,
	encryptedPayload io.Reader,
	tempRoot string,
	validation *models.ServerRestoreValidation,
	payloadEntries *[]serverBackupPayloadEntry,
	sqliteSeen *bool,
	payloadEncryptionIV string,
	encryptionKey string,
) error {
	if strings.TrimSpace(encryptionKey) == "" {
		return errors.New("encrypted backup bundle requires ENCRYPTION_KEY on the destination server")
	}
	ivBytes, err := hex.DecodeString(strings.TrimSpace(payloadEncryptionIV))
	if err != nil {
		return fmt.Errorf("invalid payload encryption IV: %w", err)
	}
	if len(ivBytes) != aes.BlockSize {
		return fmt.Errorf("invalid payload encryption IV length %d", len(ivBytes))
	}
	block, err := aes.NewCipher(deriveServerBackupCipherKey(encryptionKey))
	if err != nil {
		return err
	}
	stream := cipher.NewCTR(block, ivBytes)
	payloadTar := tar.NewReader(&cipher.StreamReader{S: stream, R: encryptedPayload})
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		header, err := payloadTar.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		entryName, err := cleanServerRestoreArchivePath(header.Name)
		if err != nil {
			return err
		}
		switch {
		case entryName == "", entryName == "data":
			continue
		case strings.HasPrefix(entryName, "data/"):
			if err := extractServerRestorePayloadEntry(ctx, tempRoot, entryName, header, payloadTar, validation, payloadEntries, sqliteSeen); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unexpected encrypted payload entry %q", header.Name)
		}
	}
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
	case serverBackupScopePortable:
		return serverBackupScopePortable, nil
	default:
		return "", fmt.Errorf("unsupported backup scope %q", scope)
	}
}

func parsePortableBackupIncludeThumbnails(r *http.Request) bool {
	raw := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("includeThumbnails")))
	switch raw {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func parseServerBackupConfidentiality(r *http.Request) (string, error) {
	mode := strings.TrimSpace(r.URL.Query().Get("confidentiality"))
	switch mode {
	case "", serverBackupConfidentialityClear:
		return serverBackupConfidentialityClear, nil
	case serverBackupConfidentialityEncrypted:
		return serverBackupConfidentialityEncrypted, nil
	default:
		return "", fmt.Errorf("unsupported backup confidentiality mode %q", mode)
	}
}

func serverBackupEntriesForScope(scope string) []string {
	switch scope {
	case serverBackupScopeCacheMetadata:
		return append([]string{}, serverBackupCacheMetadataEntries...)
	case serverBackupScopePortable:
		return []string{}
	default:
		return append([]string{}, serverBackupFullDataEntries...)
	}
}

func backupFilenamePrefix(scope string, confidentiality string) string {
	suffix := ""
	if confidentiality == serverBackupConfidentialityEncrypted {
		suffix = "-encrypted"
	}
	switch scope {
	case serverBackupScopeCacheMetadata:
		return "s3desk-cache-metadata-backup" + suffix
	case serverBackupScopePortable:
		return "s3desk-portable-backup" + suffix
	default:
		return "s3desk-full-backup" + suffix
	}
}

func buildServerBackupManifestWarnings(encryptionEnabled bool, scope string, confidentiality string, passwordProtected bool) []string {
	warnings := []string{
		"Environment config outside DATA_DIR is not included (API_TOKEN, DB_BACKEND, DATABASE_URL, ALLOWED_HOSTS, ENCRYPTION_KEY).",
	}
	if scope == serverBackupScopeCacheMetadata {
		warnings = append(warnings, "Cache + metadata backups include only the sqlite snapshot and selected cache directories such as thumbnails. Logs, artifacts, and staging data are excluded.")
	}
	if scope == serverBackupScopePortable {
		warnings = append(warnings, "Portable backups export logical application data instead of a raw sqlite database file.")
		warnings = append(warnings, "Use portable import to move data between sqlite and Postgres deployments.")
		warnings = append(warnings, "Portable backups do not include logs, artifacts, or staged restore directories.")
	}
	if encryptionEnabled {
		warnings = append(warnings, "Encrypted profile data is included, but the destination server must use the same ENCRYPTION_KEY to read it.")
		warnings = append(warnings, "Backup payload integrity is HMAC-signed with the source ENCRYPTION_KEY when available. Destinations can verify authenticity only with the same key.")
	}
	if confidentiality == serverBackupConfidentialityEncrypted {
		if passwordProtected {
			warnings = append(warnings, "Backup payload confidentiality is enabled with an operator-supplied password. Restore/import requires the same password to decrypt payload.enc.")
		} else {
			warnings = append(warnings, "Backup payload confidentiality is enabled. Restore staging requires the same ENCRYPTION_KEY so S3Desk can decrypt payload.enc before extraction.")
		}
	}
	return warnings
}

func parseServerBackupPasswordHeader(r *http.Request) (string, error) {
	return sanitizeServerBackupPassword(r.Header.Get(serverBackupPasswordHeader))
}

func sanitizeServerBackupPassword(raw string) (string, error) {
	if raw == "" {
		return "", nil
	}
	if len(raw) > serverBackupPasswordMaxBytes {
		return "", fmt.Errorf("backup password exceeds %d bytes", serverBackupPasswordMaxBytes)
	}
	if strings.ContainsAny(raw, "\x00\r\n") {
		return "", errors.New("backup password contains invalid control characters")
	}
	return raw, nil
}

func resolveServerBackupExportSecret(confidentiality string, password string, encryptionKey string) (string, error) {
	if confidentiality != serverBackupConfidentialityEncrypted {
		return "", nil
	}
	if password != "" {
		return password, nil
	}
	if strings.TrimSpace(encryptionKey) == "" {
		return "", errors.New("encrypted backup bundles require ENCRYPTION_KEY on the source server or an export password")
	}
	return encryptionKey, nil
}

func resolveServerBackupImportSecret(password string, encryptionKey string) string {
	if password != "" {
		return password
	}
	return encryptionKey
}

func backupSecretProvidedByPassword(payloadSecret string, encryptionKey string) bool {
	return payloadSecret != "" && payloadSecret != encryptionKey
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

func buildServerBackupPayloadHMAC(manifest models.ServerMigrationManifest, encryptionKey string, payloadEncryptionIV string) string {
	key := strings.TrimSpace(encryptionKey)
	if key == "" || manifest.PayloadSHA256 == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = io.WriteString(mac, manifest.Format)
	_, _ = io.WriteString(mac, "\n")
	_, _ = io.WriteString(mac, manifest.BundleKind)
	_, _ = io.WriteString(mac, "\n")
	_, _ = io.WriteString(mac, manifest.DBBackend)
	_, _ = io.WriteString(mac, "\n")
	_, _ = io.WriteString(mac, fmt.Sprintf("%d", manifest.PayloadFileCount))
	_, _ = io.WriteString(mac, "\n")
	_, _ = io.WriteString(mac, fmt.Sprintf("%d", manifest.PayloadBytes))
	_, _ = io.WriteString(mac, "\n")
	_, _ = io.WriteString(mac, manifest.PayloadSHA256)
	_, _ = io.WriteString(mac, "\n")
	_, _ = io.WriteString(mac, fmt.Sprintf("%t", manifest.EncryptionEnabled))
	if strings.TrimSpace(manifest.ConfidentialityMode) != "" {
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, manifest.ConfidentialityMode)
	}
	if strings.TrimSpace(payloadEncryptionIV) != "" {
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, strings.TrimSpace(payloadEncryptionIV))
	}
	return hex.EncodeToString(mac.Sum(nil))
}

func deriveServerBackupCipherKey(encryptionKey string) []byte {
	sum := sha256.Sum256([]byte("s3desk-backup-payload:v1\n" + strings.TrimSpace(encryptionKey)))
	return sum[:]
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

func buildServerRestoreWarnings(manifest models.ServerMigrationManifest, validation models.ServerRestoreValidation, destinationHasEncryptionKey bool) []string {
	warnings := append([]string{}, manifest.Warnings...)
	if manifest.EncryptionEnabled && !destinationHasEncryptionKey {
		warnings = append(warnings, "This server is currently running without ENCRYPTION_KEY, but the restored data still requires the source ENCRYPTION_KEY when you start from the staged DATA_DIR.")
	}
	if strings.TrimSpace(manifest.ConfidentialityMode) == serverBackupConfidentialityEncrypted {
		warnings = append(warnings, "This staged restore came from an encrypted backup payload. Keep the source ENCRYPTION_KEY available for future re-staging or audit verification of the bundle.")
	}
	if validation.PayloadSignaturePresent && !validation.PayloadSignatureVerified {
		warnings = append(warnings, "Backup payload signature is present but could not be verified on this server. Use the source ENCRYPTION_KEY to verify bundle authenticity.")
	}
	return warnings
}

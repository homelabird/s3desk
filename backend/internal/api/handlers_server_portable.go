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
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/version"
)

const (
	serverBackupScopePortable       = "portable"
	portableBackupFormatVersion     = 1
	portableBackupSchemaVersion     = 1
	portableImportModeReplace       = "replace"
	portableImportModeDryRun        = "dry_run"
	portableAssetKeyThumbnails      = "thumbnails"
	portablePreviewMaxManifestBytes = 8 << 20
)

var portableEntityOrder = []string{
	"profiles",
	"profile_connection_options",
	"jobs",
	"upload_sessions",
	"upload_multipart_uploads",
	"object_index",
	"object_favorites",
}

func (s *server) handlePreviewPortableImport(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ServerRestoreMaxBytes > 0 {
		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.ServerRestoreMaxBytes)
	}
	file, backupPassword, cleanup, err := openServerRestoreBundle(r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "bundle_too_large", "backup bundle exceeds portable import upload limit", map[string]any{
				"maxBytes": s.cfg.ServerRestoreMaxBytes,
			})
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return
	}
	defer cleanup()

	resp, err := s.processPortableImportArchive(r.Context(), file, portableImportModeDryRun, resolveServerBackupImportSecret(backupPassword, s.cfg.EncryptionKey))
	if err != nil {
		writePortableImportError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleImportPortableBackup(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ServerRestoreMaxBytes > 0 {
		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.ServerRestoreMaxBytes)
	}
	file, backupPassword, cleanup, err := openServerRestoreBundle(r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "bundle_too_large", "backup bundle exceeds portable import upload limit", map[string]any{
				"maxBytes": s.cfg.ServerRestoreMaxBytes,
			})
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return
	}
	defer cleanup()

	resp, err := s.processPortableImportArchive(r.Context(), file, portableImportModeReplace, resolveServerBackupImportSecret(backupPassword, s.cfg.EncryptionKey))
	if err != nil {
		writePortableImportError(w, err)
		return
	}
	if len(resp.Preflight.Blockers) > 0 {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *server) writePortableServerBackupArchive(ctx context.Context, archivePath string, confidentiality string, includeThumbnails bool, payloadSecret string) (models.ServerMigrationManifest, error) {
	dbBackend, err := db.ParseBackend(s.cfg.DBBackend)
	if err != nil {
		return models.ServerMigrationManifest{}, err
	}

	exportBundle, err := s.store.ExportPortableEntityFiles(ctx)
	if err != nil {
		return models.ServerMigrationManifest{}, err
	}

	now := time.Now().UTC()
	manifest := models.ServerMigrationManifest{
		Format:            serverBackupBundleFormat,
		BundleKind:        serverBackupScopePortable,
		FormatVersion:     portableBackupFormatVersion,
		CreatedAt:         now.Format(time.RFC3339),
		AppVersion:        version.Version,
		DBBackend:         string(dbBackend),
		SchemaVersion:     portableBackupSchemaVersion,
		EncryptionEnabled: s.cfg.EncryptionKey != "",
		EncryptionKeyHint: portableBackupEncryptionKeyHint(s.cfg.EncryptionKey),
		Entities:          map[string]models.ServerMigrationEntityManifest{},
		Assets:            map[string]models.ServerMigrationAssetManifest{},
		Warnings:          buildServerBackupManifestWarnings(s.cfg.EncryptionKey != "", serverBackupScopePortable, confidentiality, backupSecretProvidedByPassword(payloadSecret, s.cfg.EncryptionKey)),
	}
	if confidentiality == serverBackupConfidentialityEncrypted {
		manifest.ConfidentialityMode = confidentiality
	}

	payloadEntries := make([]serverBackupPayloadEntry, 0, len(exportBundle.EntityFiles)+32)
	entryNames := make([]string, 0, len(exportBundle.EntityFiles)+1)
	for _, name := range portableEntityOrder {
		entityFile, ok := exportBundle.EntityFiles[name]
		if !ok {
			continue
		}
		manifest.Entities[name] = models.ServerMigrationEntityManifest{
			Count:  entityFile.Count,
			SHA256: entityFile.SHA256,
		}
		entryNames = append(entryNames, "data/"+name+".jsonl")
	}
	if includeThumbnails {
		entryNames = append(entryNames, "assets/thumbnails")
	}
	sort.Strings(entryNames)
	manifest.Entries = entryNames

	tmpDir, err := os.MkdirTemp("", "s3desk-portable-backup-*")
	if err != nil {
		return models.ServerMigrationManifest{}, err
	}
	defer os.RemoveAll(tmpDir)

	archiveFile, err := os.Create(archivePath)
	if err != nil {
		return models.ServerMigrationManifest{}, err
	}
	defer archiveFile.Close()

	gzipWriter := gzip.NewWriter(archiveFile)
	defer gzipWriter.Close()
	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	if confidentiality == serverBackupConfidentialityEncrypted {
		payloadPath := filepath.Join(tmpDir, "payload.tar")
		payloadIV, err := writeEncryptedPortableBackupPayload(ctx, payloadPath, exportBundle, includeThumbnails, s.cfg.DataDir, now, &payloadEntries)
		if err != nil {
			return models.ServerMigrationManifest{}, err
		}
		if includeThumbnails {
			manifest.Assets[portableAssetKeyThumbnails] = buildPortableAssetManifest(payloadEntries, "assets/thumbnails/")
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
		for _, name := range portableEntityOrder {
			entityFile, ok := exportBundle.EntityFiles[name]
			if !ok {
				continue
			}
			payloadEntry, err := writeTarBytesFile(tarWriter, "data/"+name+".jsonl", entityFile.Data, now)
			if err != nil {
				return models.ServerMigrationManifest{}, err
			}
			payloadEntries = append(payloadEntries, payloadEntry)
		}
		if includeThumbnails {
			if err := writePortableAssetTree(ctx, tarWriter, s.cfg.DataDir, "thumbnails", now, &payloadEntries); err != nil {
				return models.ServerMigrationManifest{}, err
			}
			manifest.Assets[portableAssetKeyThumbnails] = buildPortableAssetManifest(payloadEntries, "assets/thumbnails/")
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

func writeEncryptedPortableBackupPayload(
	ctx context.Context,
	payloadPath string,
	exportBundle store.PortableExportBundle,
	includeThumbnails bool,
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
	for _, name := range portableEntityOrder {
		entityFile, ok := exportBundle.EntityFiles[name]
		if !ok {
			continue
		}
		payloadEntry, err := writeTarBytesFile(payloadWriter, "data/"+name+".jsonl", entityFile.Data, now)
		if err != nil {
			_ = payloadWriter.Close()
			_ = payloadFile.Close()
			return "", err
		}
		*payloadEntries = append(*payloadEntries, payloadEntry)
	}
	if includeThumbnails {
		if err := writePortableAssetTree(ctx, payloadWriter, dataDir, "thumbnails", now, payloadEntries); err != nil {
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

func writePortableAssetTree(ctx context.Context, tarWriter *tar.Writer, dataDir, rel string, now time.Time, payloadEntries *[]serverBackupPayloadEntry) error {
	root := filepath.Join(dataDir, rel)
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
		relPath, err := filepath.Rel(dataDir, pathOnDisk)
		if err != nil {
			return err
		}
		archivePath := filepath.ToSlash(filepath.Join("assets", relPath))
		if info.IsDir() {
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

func buildPortableAssetManifest(entries []serverBackupPayloadEntry, prefix string) models.ServerMigrationAssetManifest {
	filtered := make([]serverBackupPayloadEntry, 0, len(entries))
	for _, entry := range entries {
		if strings.HasPrefix(entry.ArchivePath, prefix) {
			filtered = append(filtered, entry)
		}
	}
	fileCount, bytes, sha := buildServerBackupPayloadSummary(filtered)
	return models.ServerMigrationAssetManifest{
		FileCount: fileCount,
		Bytes:     bytes,
		SHA256:    sha,
	}
}

func writeTarBytesFile(tarWriter *tar.Writer, archivePath string, data []byte, modTime time.Time) (serverBackupPayloadEntry, error) {
	header := &tar.Header{
		Name:     archivePath,
		Mode:     0o600,
		Size:     int64(len(data)),
		ModTime:  modTime,
		Typeflag: tar.TypeReg,
	}
	if err := tarWriter.WriteHeader(header); err != nil {
		return serverBackupPayloadEntry{}, err
	}
	if _, err := tarWriter.Write(data); err != nil {
		return serverBackupPayloadEntry{}, err
	}
	sum := sha256.Sum256(data)
	return serverBackupPayloadEntry{
		ArchivePath: archivePath,
		Size:        int64(len(data)),
		SHA256:      hex.EncodeToString(sum[:]),
	}, nil
}

func (s *server) processPortableImportArchive(ctx context.Context, src io.Reader, mode string, payloadSecret string) (models.ServerPortableImportResponse, error) {
	if mode != portableImportModeReplace && mode != portableImportModeDryRun {
		return models.ServerPortableImportResponse{}, fmt.Errorf("unsupported portable import mode %q", mode)
	}

	dbBackend, err := db.ParseBackend(s.cfg.DBBackend)
	if err != nil {
		return models.ServerPortableImportResponse{}, err
	}

	tempRoot, manifest, entityFiles, assetRoot, _, err := extractPortableArchive(ctx, src, payloadSecret)
	if err != nil {
		return models.ServerPortableImportResponse{}, err
	}
	defer os.RemoveAll(tempRoot)

	preflight := models.ServerPortableImportPreflight{
		SchemaReady:               manifest.FormatVersion == portableBackupFormatVersion && manifest.SchemaVersion == portableBackupSchemaVersion,
		EncryptionReady:           !manifest.EncryptionEnabled || strings.TrimSpace(s.cfg.EncryptionKey) != "",
		EncryptionKeyHintVerified: !manifest.EncryptionEnabled || manifest.EncryptionKeyHint == "" || manifest.EncryptionKeyHint == portableBackupEncryptionKeyHint(s.cfg.EncryptionKey),
		SpaceReady:                true,
	}
	if manifest.FormatVersion != portableBackupFormatVersion {
		preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Portable bundle formatVersion %d is unsupported; expected %d.", manifest.FormatVersion, portableBackupFormatVersion))
	}
	if manifest.SchemaVersion != portableBackupSchemaVersion {
		preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Portable bundle schemaVersion %d is unsupported; expected %d.", manifest.SchemaVersion, portableBackupSchemaVersion))
	}
	if !preflight.EncryptionReady {
		preflight.Blockers = append(preflight.Blockers, "Destination server is missing ENCRYPTION_KEY required by the portable bundle.")
	}
	if manifest.EncryptionEnabled && manifest.EncryptionKeyHint != "" && !preflight.EncryptionKeyHintVerified {
		preflight.Blockers = append(preflight.Blockers, "Destination ENCRYPTION_KEY does not match the portable bundle encryption fingerprint.")
	}
	if assetSummary, ok := manifest.Assets[portableAssetKeyThumbnails]; ok && assetSummary.Bytes > 0 {
		freeBytes, diskErr := availableDiskBytes(s.cfg.DataDir)
		if diskErr != nil {
			preflight.SpaceReady = false
			preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Failed to check disk space for thumbnail assets: %v", diskErr))
		} else if freeBytes < assetSummary.Bytes {
			preflight.SpaceReady = false
			preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Need %d bytes free for thumbnail assets, only %d available.", assetSummary.Bytes, freeBytes))
		}
	}

	entityResults := make([]models.ServerPortableImportEntityResult, 0, len(portableEntityOrder))
	entityChecksumsVerified := true
	for _, name := range portableEntityOrder {
		manifestEntity, ok := manifest.Entities[name]
		if !ok {
			entityChecksumsVerified = false
			preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Portable manifest is missing entity summary for %s.", name))
			continue
		}
		data, ok := entityFiles[name]
		if !ok {
			entityChecksumsVerified = false
			preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Portable bundle is missing data/%s.jsonl.", name))
			entityResults = append(entityResults, models.ServerPortableImportEntityResult{
				Name:             name,
				ExportedCount:    manifestEntity.Count,
				ChecksumVerified: false,
			})
			continue
		}
		sum := sha256.Sum256(data)
		checksumVerified := strings.EqualFold(hex.EncodeToString(sum[:]), manifestEntity.SHA256)
		if !checksumVerified {
			entityChecksumsVerified = false
			preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Checksum mismatch for %s.", name))
		}
		entityResults = append(entityResults, models.ServerPortableImportEntityResult{
			Name:             name,
			ExportedCount:    manifestEntity.Count,
			ChecksumVerified: checksumVerified,
		})
	}

	resp := models.ServerPortableImportResponse{
		Manifest:        manifest,
		Mode:            mode,
		TargetDBBackend: string(dbBackend),
		Preflight:       preflight,
		Entities:        entityResults,
		Verification: models.ServerPortableImportVerification{
			EntityChecksumsVerified:     entityChecksumsVerified,
			PostImportHealthCheckPassed: mode == portableImportModeDryRun,
		},
	}

	if len(preflight.Blockers) > 0 || mode == portableImportModeDryRun {
		return resp, nil
	}

	counts, err := s.store.ImportPortableEntityFilesReplace(ctx, entityFiles)
	if err != nil {
		return models.ServerPortableImportResponse{}, err
	}
	resp.Entities = applyPortableImportCounts(resp.Entities, counts)

	if assetRoot != "" {
		thumbnailsPath := filepath.Join(assetRoot, portableAssetKeyThumbnails)
		if info, statErr := os.Stat(thumbnailsPath); statErr == nil && info.IsDir() {
			assetTargetDir := filepath.Join(s.cfg.DataDir, portableAssetKeyThumbnails)
			if err := copyPortableAssetTree(thumbnailsPath, assetTargetDir); err != nil {
				resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but failed to copy thumbnail assets: %v", err))
			} else {
				resp.AssetStagingDir = assetTargetDir
			}
		}
	}

	if err := s.store.Ping(ctx); err == nil {
		resp.Verification.PostImportHealthCheckPassed = true
	}
	if !verifyPortableImportCounts(resp.Entities) {
		resp.Warnings = append(resp.Warnings, "Imported row counts did not match the manifest counts for one or more entities.")
	}
	return resp, nil
}

func extractPortableArchive(ctx context.Context, src io.Reader, encryptionKey string) (string, models.ServerMigrationManifest, map[string][]byte, string, []serverBackupPayloadEntry, error) {
	tempRoot, err := os.MkdirTemp("", "s3desk-portable-import-*")
	if err != nil {
		return "", models.ServerMigrationManifest{}, nil, "", nil, err
	}

	gzipReader, err := gzip.NewReader(src)
	if err != nil {
		_ = os.RemoveAll(tempRoot)
		return "", models.ServerMigrationManifest{}, nil, "", nil, err
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)
	var manifest models.ServerMigrationManifest
	var archiveManifest serverBackupArchiveManifest
	manifestSeen := false
	payloadEntries := make([]serverBackupPayloadEntry, 0, 32)

	for {
		if err := ctx.Err(); err != nil {
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, err
		}
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, err
		}
		entryName, err := cleanServerRestoreArchivePath(header.Name)
		if err != nil {
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, err
		}
		switch {
		case entryName == "":
			continue
		case entryName == "manifest.json":
			data, err := io.ReadAll(io.LimitReader(tarReader, portablePreviewMaxManifestBytes))
			if err != nil {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, err
			}
			if err := json.Unmarshal(data, &archiveManifest); err != nil {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, err
			}
			manifest = archiveManifest.ServerMigrationManifest
			if manifest.Format != serverBackupBundleFormat {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, fmt.Errorf("unsupported backup format %q", manifest.Format)
			}
			if manifest.BundleKind != serverBackupScopePortable {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, fmt.Errorf("portable import requires a portable bundle, got %q", manifest.BundleKind)
			}
			manifestSeen = true
		case entryName == "data", entryName == "assets":
			continue
		case strings.HasPrefix(entryName, "data/"), strings.HasPrefix(entryName, "assets/"):
			if strings.TrimSpace(manifest.ConfidentialityMode) == serverBackupConfidentialityEncrypted {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, errors.New("encrypted portable bundle cannot mix clear payload entries with payload.enc")
			}
			if err := extractPortablePayloadEntry(ctx, tempRoot, entryName, header, tarReader, &payloadEntries); err != nil {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, err
			}
		case entryName == "payload.enc":
			if !manifestSeen {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, errors.New("portable manifest must appear before payload.enc")
			}
			if strings.TrimSpace(manifest.ConfidentialityMode) != serverBackupConfidentialityEncrypted {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, errors.New("unexpected encrypted payload entry in clear portable bundle")
			}
			if err := ensurePortableDiskSpace(tempRoot, "payload.enc", manifest.PayloadBytes); err != nil {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, err
			}
			if err := extractEncryptedPortablePayload(ctx, tarReader, tempRoot, archiveManifest.PayloadEncryptionIV, encryptionKey, &payloadEntries); err != nil {
				_ = os.RemoveAll(tempRoot)
				return "", models.ServerMigrationManifest{}, nil, "", nil, err
			}
		default:
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, fmt.Errorf("unexpected archive entry %q", entryName)
		}
	}

	if !manifestSeen {
		_ = os.RemoveAll(tempRoot)
		return "", models.ServerMigrationManifest{}, nil, "", nil, errors.New("portable manifest is missing")
	}
	if manifest.PayloadSHA256 != "" {
		fileCount, payloadBytes, payloadSHA256 := buildServerBackupPayloadSummary(payloadEntries)
		switch {
		case manifest.PayloadFileCount != 0 && manifest.PayloadFileCount != fileCount:
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, fmt.Errorf("portable payload file count mismatch: manifest=%d extracted=%d", manifest.PayloadFileCount, fileCount)
		case manifest.PayloadBytes != 0 && manifest.PayloadBytes != payloadBytes:
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, fmt.Errorf("portable payload bytes mismatch: manifest=%d extracted=%d", manifest.PayloadBytes, payloadBytes)
		case !strings.EqualFold(manifest.PayloadSHA256, payloadSHA256):
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, fmt.Errorf("portable payload checksum mismatch: manifest=%s extracted=%s", manifest.PayloadSHA256, payloadSHA256)
		}
	}
	if archiveManifest.PayloadHMACSHA256 != "" {
		expectedHMAC := buildServerBackupPayloadHMAC(manifest, encryptionKey, archiveManifest.PayloadEncryptionIV)
		if expectedHMAC != "" && !hmac.Equal([]byte(strings.ToLower(strings.TrimSpace(archiveManifest.PayloadHMACSHA256))), []byte(expectedHMAC)) {
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, errors.New("portable payload signature mismatch")
		}
	}

	entityFiles := make(map[string][]byte, len(portableEntityOrder))
	for _, name := range portableEntityOrder {
		pathOnDisk := filepath.Join(tempRoot, "data", name+".jsonl")
		data, err := os.ReadFile(pathOnDisk)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			_ = os.RemoveAll(tempRoot)
			return "", models.ServerMigrationManifest{}, nil, "", nil, err
		}
		entityFiles[name] = data
	}

	assetRoot := filepath.Join(tempRoot, "assets")
	if _, err := os.Stat(assetRoot); err != nil {
		assetRoot = ""
	}

	return tempRoot, manifest, entityFiles, assetRoot, payloadEntries, nil
}

func extractPortablePayloadEntry(ctx context.Context, tempRoot string, entryName string, header *tar.Header, entryReader io.Reader, payloadEntries *[]serverBackupPayloadEntry) error {
	targetPath, err := resolveRestorePath(tempRoot, entryName)
	if err != nil {
		return err
	}
	switch header.Typeflag {
	case tar.TypeDir:
		return os.MkdirAll(targetPath, 0o700)
	case tar.TypeReg, tar.TypeRegA:
		if err := ensurePortableDiskSpace(tempRoot, entryName, header.Size); err != nil {
			return err
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
		return nil
	case tar.TypeSymlink, tar.TypeLink:
		return fmt.Errorf("portable archive entry %q uses an unsupported link type", header.Name)
	default:
		return fmt.Errorf("portable archive entry %q uses unsupported type %d", header.Name, header.Typeflag)
	}
}

func extractEncryptedPortablePayload(ctx context.Context, encryptedPayload io.Reader, tempRoot string, payloadEncryptionIV string, encryptionKey string, payloadEntries *[]serverBackupPayloadEntry) error {
	if strings.TrimSpace(encryptionKey) == "" {
		return errors.New("encrypted portable bundle requires ENCRYPTION_KEY on the destination server")
	}
	ivBytes, err := hex.DecodeString(strings.TrimSpace(payloadEncryptionIV))
	if err != nil {
		return fmt.Errorf("invalid portable payload encryption IV: %w", err)
	}
	if len(ivBytes) != aes.BlockSize {
		return fmt.Errorf("invalid portable payload encryption IV length %d", len(ivBytes))
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
		case entryName == "", entryName == "data", entryName == "assets":
			continue
		case strings.HasPrefix(entryName, "data/"), strings.HasPrefix(entryName, "assets/"):
			if err := extractPortablePayloadEntry(ctx, tempRoot, entryName, header, payloadTar, payloadEntries); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unexpected encrypted portable payload entry %q", header.Name)
		}
	}
}

func applyPortableImportCounts(results []models.ServerPortableImportEntityResult, counts store.PortableImportCounts) []models.ServerPortableImportEntityResult {
	importedByName := map[string]int{
		"profiles":                   counts.Profiles,
		"profile_connection_options": counts.ProfileConnectionOptions,
		"jobs":                       counts.Jobs,
		"upload_sessions":            counts.UploadSessions,
		"upload_multipart_uploads":   counts.UploadMultipartUploads,
		"object_index":               counts.ObjectIndex,
		"object_favorites":           counts.ObjectFavorites,
	}
	out := append([]models.ServerPortableImportEntityResult(nil), results...)
	for i := range out {
		out[i].ImportedCount = importedByName[out[i].Name]
	}
	return out
}

func verifyPortableImportCounts(results []models.ServerPortableImportEntityResult) bool {
	for _, item := range results {
		if item.ExportedCount != item.ImportedCount {
			return false
		}
		if !item.ChecksumVerified {
			return false
		}
	}
	return true
}

func copyPortableAssetTree(srcRoot, dstRoot string) error {
	return filepath.WalkDir(srcRoot, func(pathOnDisk string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relPath, err := filepath.Rel(srcRoot, pathOnDisk)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(dstRoot, relPath)
		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0o700)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
			return err
		}
		if err := ensurePortableDiskSpace(filepath.Dir(targetPath), relPath, info.Size()); err != nil {
			return err
		}
		srcFile, err := os.Open(pathOnDisk)
		if err != nil {
			return err
		}
		defer srcFile.Close()
		dstFile, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if err != nil {
			return err
		}
		defer dstFile.Close()
		_, err = io.Copy(dstFile, srcFile)
		return err
	})
}

func ensurePortableDiskSpace(root string, path string, requiredBytes int64) error {
	if requiredBytes <= 0 {
		return nil
	}
	freeBytes, err := availableDiskBytes(root)
	if err != nil {
		return err
	}
	if requiredBytes > freeBytes {
		return serverRestorePreflightError{
			Path:           path,
			RequiredBytes:  requiredBytes,
			AvailableBytes: freeBytes,
		}
	}
	return nil
}

func portableBackupEncryptionKeyHint(encryptionKey string) string {
	key := strings.TrimSpace(encryptionKey)
	if key == "" {
		return ""
	}
	raw, err := decodePortableBase64Key(key)
	if err != nil {
		sum := sha256.Sum256([]byte(key))
		return hex.EncodeToString(sum[:8])
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:8])
}

func decodePortableBase64Key(s string) ([]byte, error) {
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		if b, err := enc.DecodeString(s); err == nil {
			return b, nil
		}
	}
	return nil, errors.New("invalid base64 encryption key")
}

func writePortableImportError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	code := "portable_import_failed"
	details := map[string]any{"error": err.Error()}
	var preflightErr serverRestorePreflightError
	if errors.As(err, &preflightErr) {
		status = http.StatusConflict
		code = "portable_import_blocked"
		details["path"] = preflightErr.Path
		details["requiredBytes"] = preflightErr.RequiredBytes
		details["availableBytes"] = preflightErr.AvailableBytes
	} else if strings.Contains(strings.ToLower(err.Error()), "missing encryption_key") || strings.Contains(strings.ToLower(err.Error()), "requires encryption_key") {
		status = http.StatusConflict
		code = "portable_import_blocked"
	}
	writeError(w, status, code, "failed to process portable backup bundle", details)
}

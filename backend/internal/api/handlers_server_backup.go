package api

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
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
	serverBackupBundleFormat              = "s3desk-server-backup/v1"
	serverBackupScopeFull                 = "full"
	serverBackupScopeCacheMetadata        = "cache_metadata"
	serverBackupConfidentialityClear      = "clear"
	serverBackupConfidentialityEncrypted  = "encrypted"
	serverBackupPasswordHeader            = "X-S3Desk-Backup-Password" // #nosec G101 -- HTTP header name, not a credential value.
	serverBackupPasswordMaxBytes          = 4096
	serverRestoreMultipartFormMaxMemory   = 32 << 20
	serverBackupPayloadEncryptionV2       = "v2"
	serverBackupPayloadCipherV2           = "aes-256-gcm-chunked"
	serverBackupPayloadKDFV2              = "pbkdf2-sha256"
	serverBackupPayloadKDFIterationsV2    = 210_000
	serverBackupPayloadMaxKDFIterationsV2 = 1_000_000
	serverBackupPayloadSaltBytesV2        = 16
	serverBackupPayloadNonceBytesV2       = 12
	serverBackupPayloadChunkBytesV2       = 1 << 20
	serverBackupPayloadMaxChunkBytesV2    = 16 << 20
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
	PayloadHMACSHA256          string `json:"payloadHmacSha256,omitempty"`
	PayloadEncryptionIV        string `json:"payloadEncryptionIv,omitempty"`
	PayloadEncryptionVersion   string `json:"payloadEncryptionVersion,omitempty"`
	PayloadEncryptionCipher    string `json:"payloadEncryptionCipher,omitempty"`
	PayloadEncryptionKDF       string `json:"payloadEncryptionKdf,omitempty"`
	PayloadEncryptionKDFIters  int    `json:"payloadEncryptionKdfIterations,omitempty"`
	PayloadEncryptionSalt      string `json:"payloadEncryptionSalt,omitempty"`
	PayloadEncryptionNonce     string `json:"payloadEncryptionNonce,omitempty"`
	PayloadEncryptionChunkSize int    `json:"payloadEncryptionChunkBytes,omitempty"`
}

type serverBackupSecrets struct {
	PayloadSecret string
	HMACSecret    string
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
	newServerBackupHTTPService(s).handleGetServerBackup(w, r)
}

func (s *server) handleRestoreServerBackup(w http.ResponseWriter, r *http.Request) {
	newServerBackupHTTPService(s).handleRestoreServerBackup(w, r)
}

func (s *server) writeServerBackupArchive(ctx context.Context, archivePath string, scope string, confidentiality string, includeThumbnails bool, secrets serverBackupSecrets) (models.ServerMigrationManifest, error) {
	if scope == serverBackupScopePortable {
		return s.writePortableServerBackupArchive(ctx, archivePath, confidentiality, includeThumbnails, secrets)
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
		Warnings:          buildServerBackupManifestWarnings(s.cfg.EncryptionKey != "", scope, confidentiality, backupSecretProvidedByPassword(secrets.PayloadSecret, s.cfg.EncryptionKey)),
	}
	if confidentiality == serverBackupConfidentialityEncrypted {
		manifest.ConfidentialityMode = confidentiality
	}

	// #nosec G304 -- archivePath is a server-created temporary backup path.
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
		if err := writeEncryptedServerBackupPayload(ctx, payloadPath, sqliteBackupPath, scope, s.cfg.DataDir, now, &payloadEntries); err != nil {
			return models.ServerMigrationManifest{}, err
		}
		manifest.PayloadFileCount, manifest.PayloadBytes, manifest.PayloadSHA256 = buildServerBackupPayloadSummary(payloadEntries)
		archiveManifest, err := buildEncryptedServerBackupArchiveManifest(manifest, secrets.HMACSecret)
		if err != nil {
			return models.ServerMigrationManifest{}, err
		}
		if err := writeTarJSONFile(tarWriter, "manifest.json", archiveManifest, now); err != nil {
			return models.ServerMigrationManifest{}, err
		}
		if err := writeEncryptedPayloadFile(tarWriter, payloadPath, archiveManifest, secrets.PayloadSecret); err != nil {
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
		archiveManifest := buildServerBackupArchiveManifest(manifest, secrets.HMACSecret)
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
) error {
	// #nosec G304 -- payloadPath lives under an os.MkdirTemp-managed workspace.
	payloadFile, err := os.Create(payloadPath)
	if err != nil {
		return err
	}
	payloadWriter := tar.NewWriter(payloadFile)
	if err := writeTarDirHeader(payloadWriter, "data/", now); err != nil {
		_ = payloadWriter.Close()
		_ = payloadFile.Close()
		return err
	}
	sqliteEntry, err := writeTarFileFromDisk(payloadWriter, sqliteBackupPath, "data/s3desk.db")
	if err != nil {
		_ = payloadWriter.Close()
		_ = payloadFile.Close()
		return err
	}
	*payloadEntries = append(*payloadEntries, sqliteEntry)
	for _, rel := range serverBackupEntriesForScope(scope) {
		if err := writeTarPathTree(ctx, payloadWriter, dataDir, rel, now, payloadEntries); err != nil {
			_ = payloadWriter.Close()
			_ = payloadFile.Close()
			return err
		}
	}
	if err := payloadWriter.Close(); err != nil {
		_ = payloadFile.Close()
		return err
	}
	if err := payloadFile.Close(); err != nil {
		return err
	}
	return nil
}

func writeEncryptedPayloadFile(tarWriter *tar.Writer, payloadPath string, archiveManifest serverBackupArchiveManifest, encryptionKey string) error {
	switch strings.TrimSpace(archiveManifest.PayloadEncryptionVersion) {
	case serverBackupPayloadEncryptionV2:
		return writeEncryptedPayloadFileV2(tarWriter, payloadPath, archiveManifest, encryptionKey)
	case "":
		return writeLegacyEncryptedPayloadFile(tarWriter, payloadPath, archiveManifest.PayloadEncryptionIV, encryptionKey)
	default:
		return fmt.Errorf("unsupported payload encryption version %q", archiveManifest.PayloadEncryptionVersion)
	}
}

func writeLegacyEncryptedPayloadFile(tarWriter *tar.Writer, payloadPath string, payloadIV string, encryptionKey string) error {
	ivBytes, err := hex.DecodeString(strings.TrimSpace(payloadIV))
	if err != nil {
		return err
	}
	if len(ivBytes) != aes.BlockSize {
		return fmt.Errorf("invalid payload encryption IV length %d", len(ivBytes))
	}
	// #nosec G304 -- payloadPath lives under an os.MkdirTemp-managed workspace.
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

func writeEncryptedPayloadFileV2(tarWriter *tar.Writer, payloadPath string, archiveManifest serverBackupArchiveManifest, encryptionKey string) error {
	encryptedPath := payloadPath + ".enc"
	if err := encryptServerBackupPayloadFileV2(payloadPath, encryptedPath, archiveManifest, encryptionKey); err != nil {
		return err
	}
	defer os.Remove(encryptedPath)

	// #nosec G304 -- encryptedPath is derived from an os.MkdirTemp-managed payload path.
	encryptedFile, err := os.Open(encryptedPath)
	if err != nil {
		return err
	}
	defer encryptedFile.Close()
	info, err := encryptedFile.Stat()
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
	_, err = io.Copy(tarWriter, encryptedFile)
	return err
}

func encryptServerBackupPayloadFileV2(payloadPath string, encryptedPath string, archiveManifest serverBackupArchiveManifest, encryptionKey string) error {
	aead, baseNonce, chunkSize, err := serverBackupPayloadAEADV2(archiveManifest, encryptionKey)
	if err != nil {
		return err
	}
	// #nosec G304 -- payloadPath lives under an os.MkdirTemp-managed workspace.
	payloadFile, err := os.Open(payloadPath)
	if err != nil {
		return err
	}
	defer payloadFile.Close()
	// #nosec G304 -- encryptedPath is derived from an os.MkdirTemp-managed payload path.
	encryptedFile, err := os.OpenFile(encryptedPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	success := false
	defer func() {
		_ = encryptedFile.Close()
		if !success {
			_ = os.Remove(encryptedPath)
		}
	}()

	buffer := make([]byte, chunkSize)
	var counter uint64
	for {
		n, readErr := io.ReadFull(payloadFile, buffer)
		if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
			return readErr
		}
		if n > 0 {
			// #nosec G407 -- baseNonce is generated by crypto/rand and the counter only derives unique per-frame nonces.
			sealed := aead.Seal(nil, serverBackupPayloadChunkNonce(baseNonce, counter), buffer[:n], nil)
			if err := writeServerBackupPayloadFrame(encryptedFile, sealed); err != nil {
				return err
			}
			counter++
		}
		if errors.Is(readErr, io.EOF) || errors.Is(readErr, io.ErrUnexpectedEOF) {
			break
		}
	}
	if err := encryptedFile.Close(); err != nil {
		return err
	}
	success = true
	return nil
}

func (s *server) restoreServerBackupArchive(ctx context.Context, src io.Reader, backupPassword string, encryptionKey string) (models.ServerRestoreResponse, error) {
	s.restoreMu.Lock()
	defer s.restoreMu.Unlock()

	restoreBase := filepath.Join(s.cfg.DataDir, "restores")
	if err := os.MkdirAll(restoreBase, 0o700); err != nil {
		return models.ServerRestoreResponse{}, err
	}

	restoreID := ulid.Make().String()
	staging, err := newManagedServerRestoreStagingDir(restoreBase, restoreID)
	if err != nil {
		return models.ServerRestoreResponse{}, err
	}
	tempRoot := staging.TempRoot()
	finalRoot := staging.FinalRoot()
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
			staging.Cleanup()
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
	extractBudget := newServerRestoreExtractBudget(s.cfg.ServerRestoreMaxBytes)

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
			if err := extractServerRestorePayloadEntry(ctx, tempRoot, entryName, header, tarReader, &validation, &payloadEntries, &sqliteSeen, extractBudget); err != nil {
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
			secrets := resolveServerBackupArchiveSecrets(manifest, backupPassword, encryptionKey)
			if err := extractEncryptedServerRestorePayload(ctx, tarReader, tempRoot, &validation, &payloadEntries, &sqliteSeen, archiveManifest, secrets.PayloadSecret, extractBudget); err != nil {
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
	payloadVerification, err := verifyServerRestorePayload("backup", manifest, archiveManifest, payloadEntries, backupPassword, encryptionKey)
	if err != nil {
		return models.ServerRestoreResponse{}, err
	}
	validation.PayloadChecksumPresent = payloadVerification.ChecksumPresent
	validation.PayloadChecksumVerified = payloadVerification.ChecksumVerified
	validation.PayloadSignaturePresent = payloadVerification.SignaturePresent
	validation.PayloadSignatureVerified = payloadVerification.SignatureVerified
	if manifest.DBBackend == string(db.BackendSQLite) && !sqliteSeen {
		return models.ServerRestoreResponse{}, errors.New("sqlite database is missing from backup bundle")
	}
	if err := staging.Commit(); err != nil {
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
	if err := preflightServerRestoreMultipart(r); err != nil {
		return nil, "", nil, err
	}
	if err := r.ParseMultipartForm(serverRestoreMultipartFormMaxMemory); err != nil {
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

func preflightServerRestoreMultipart(r *http.Request) error {
	if r == nil || r.ContentLength <= 0 {
		return nil
	}
	requiredBytes := requiredServerRestoreMultipartTempBytes(r.ContentLength)
	if requiredBytes <= 0 {
		return nil
	}
	tempDir := os.TempDir()
	if strings.TrimSpace(tempDir) == "" {
		return nil
	}
	freeBytes, err := availableDiskBytes(tempDir)
	if err != nil {
		return nil
	}
	if freeBytes < requiredBytes {
		return serverRestorePreflightError{
			Path:           tempDir,
			RequiredBytes:  requiredBytes,
			AvailableBytes: freeBytes,
		}
	}
	return nil
}

func requiredServerRestoreMultipartTempBytes(contentLength int64) int64 {
	if contentLength <= 0 || contentLength <= serverRestoreMultipartFormMaxMemory {
		return 0
	}
	return contentLength - serverRestoreMultipartFormMaxMemory
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
		if shouldExcludeServerBackupDataFile(relPath) {
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

func shouldExcludeServerBackupDataFile(relPath string) bool {
	return strings.HasSuffix(filepath.Base(relPath), ".rclone.conf")
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
	// #nosec G304 -- sourcePath is supplied by internal backup walkers or validated restore helpers.
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

func archiveEntryFileMode(mode int64) (fs.FileMode, error) {
	const maxArchiveEntryMode = int64(^uint32(0))
	if mode < 0 || mode > maxArchiveEntryMode {
		return 0, fmt.Errorf("archive entry has invalid mode %d", mode)
	}
	return fs.FileMode(uint32(mode)) & 0o777, nil
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
	extractBudget *serverRestoreExtractBudget,
) error {
	relPath := strings.TrimPrefix(entryName, "data/")
	if relPath == "" {
		return nil
	}
	if err := extractServerRestoreArchiveEntryWithBudget(tempRoot, relPath, entryName, header, entryReader, payloadEntries, "archive entry", extractBudget); err != nil {
		return err
	}
	validation.PayloadFileCount++
	validation.PayloadBytes += header.Size
	if relPath == "s3desk.db" {
		*sqliteSeen = true
	}
	return nil
}

func extractEncryptedServerRestorePayload(
	ctx context.Context,
	encryptedPayload io.Reader,
	tempRoot string,
	validation *models.ServerRestoreValidation,
	payloadEntries *[]serverBackupPayloadEntry,
	sqliteSeen *bool,
	archiveManifest serverBackupArchiveManifest,
	encryptionKey string,
	extractBudget *serverRestoreExtractBudget,
) error {
	if strings.TrimSpace(encryptionKey) == "" {
		return errors.New("encrypted backup bundle requires the backup password or ENCRYPTION_KEY on the destination server")
	}
	payloadTar, cleanup, err := openEncryptedServerBackupPayloadTarReader(ctx, encryptedPayload, archiveManifest, encryptionKey)
	if err != nil {
		return err
	}
	defer cleanup()
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
			if err := extractServerRestorePayloadEntry(ctx, tempRoot, entryName, header, payloadTar, validation, payloadEntries, sqliteSeen, extractBudget); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unexpected encrypted payload entry %q", header.Name)
		}
	}
}

func openEncryptedServerBackupPayloadTarReader(
	ctx context.Context,
	encryptedPayload io.Reader,
	archiveManifest serverBackupArchiveManifest,
	encryptionKey string,
) (*tar.Reader, func(), error) {
	switch strings.TrimSpace(archiveManifest.PayloadEncryptionVersion) {
	case serverBackupPayloadEncryptionV2:
		payloadReader, err := newServerBackupPayloadV2Reader(ctx, encryptedPayload, archiveManifest, encryptionKey)
		if err != nil {
			return nil, nil, err
		}
		return tar.NewReader(payloadReader), func() {}, nil
	case "":
		streamReader, err := legacyEncryptedServerBackupPayloadReader(encryptedPayload, archiveManifest.PayloadEncryptionIV, encryptionKey)
		if err != nil {
			return nil, nil, err
		}
		return tar.NewReader(streamReader), func() {}, nil
	default:
		return nil, nil, fmt.Errorf("unsupported payload encryption version %q", archiveManifest.PayloadEncryptionVersion)
	}
}

func legacyEncryptedServerBackupPayloadReader(encryptedPayload io.Reader, payloadEncryptionIV string, encryptionKey string) (io.Reader, error) {
	ivBytes, err := hex.DecodeString(strings.TrimSpace(payloadEncryptionIV))
	if err != nil {
		return nil, fmt.Errorf("invalid payload encryption IV: %w", err)
	}
	if len(ivBytes) != aes.BlockSize {
		return nil, fmt.Errorf("invalid payload encryption IV length %d", len(ivBytes))
	}
	block, err := aes.NewCipher(deriveServerBackupCipherKey(encryptionKey))
	if err != nil {
		return nil, err
	}
	stream := cipher.NewCTR(block, ivBytes)
	return &cipher.StreamReader{S: stream, R: encryptedPayload}, nil
}

type serverBackupPayloadV2Reader struct {
	ctx          context.Context
	source       io.Reader
	aead         cipher.AEAD
	baseNonce    []byte
	maxFrameSize int
	counter      uint64
	plaintext    []byte
	done         bool
}

func newServerBackupPayloadV2Reader(ctx context.Context, encryptedPayload io.Reader, archiveManifest serverBackupArchiveManifest, encryptionKey string) (*serverBackupPayloadV2Reader, error) {
	aead, baseNonce, chunkSize, err := serverBackupPayloadAEADV2(archiveManifest, encryptionKey)
	if err != nil {
		return nil, err
	}
	return &serverBackupPayloadV2Reader{
		ctx:          ctx,
		source:       encryptedPayload,
		aead:         aead,
		baseNonce:    baseNonce,
		maxFrameSize: chunkSize + aead.Overhead(),
	}, nil
}

func (r *serverBackupPayloadV2Reader) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	for len(r.plaintext) == 0 {
		if r.done {
			return 0, io.EOF
		}
		if err := r.ctx.Err(); err != nil {
			return 0, err
		}
		frame, err := readServerBackupPayloadFrame(r.source, r.maxFrameSize)
		if errors.Is(err, io.EOF) {
			r.done = true
			return 0, io.EOF
		}
		if err != nil {
			return 0, err
		}
		plaintext, err := r.aead.Open(nil, serverBackupPayloadChunkNonce(r.baseNonce, r.counter), frame, nil)
		if err != nil {
			return 0, errors.New("encrypted backup payload authentication failed")
		}
		r.plaintext = plaintext
		r.counter++
	}
	n := copy(p, r.plaintext)
	r.plaintext = r.plaintext[n:]
	return n, nil
}

func cleanServerRestoreArchivePath(name string) (string, error) {
	raw := strings.TrimPrefix(strings.TrimSpace(name), "./")
	if containsParentPathSegment(raw) {
		return "", fmt.Errorf("archive entry %q contains an invalid path segment", name)
	}
	cleaned := path.Clean(raw)
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

func parsePortableBackupIncludeThumbnails(r *http.Request) (bool, error) {
	raw := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("includeThumbnails")))
	switch raw {
	case "":
		return true, nil
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	default:
		return false, fmt.Errorf("includeThumbnails is invalid")
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
	} else {
		warnings = append(warnings, "Transient rclone config files (*.rclone.conf) are excluded because they can contain provider credentials.")
	}
	if encryptionEnabled {
		warnings = append(warnings, "Encrypted profile data is included, but the destination server must use the same ENCRYPTION_KEY to read it.")
	}
	if confidentiality == serverBackupConfidentialityEncrypted && passwordProtected {
		warnings = append(warnings, "Backup payload integrity is HMAC-signed with the same operator-supplied password used for confidentiality. Restore/import requires that password to verify authenticity.")
	} else if encryptionEnabled {
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

func resolveServerBackupExportSecrets(confidentiality string, password string, encryptionKey string) (serverBackupSecrets, error) {
	if confidentiality != serverBackupConfidentialityEncrypted {
		return serverBackupSecrets{HMACSecret: strings.TrimSpace(encryptionKey)}, nil
	}
	if password != "" {
		return serverBackupSecrets{PayloadSecret: password, HMACSecret: password}, nil
	}
	trimmedKey := strings.TrimSpace(encryptionKey)
	if trimmedKey == "" {
		return serverBackupSecrets{}, errors.New("encrypted backup bundles require ENCRYPTION_KEY on the source server or an export password")
	}
	return serverBackupSecrets{PayloadSecret: trimmedKey, HMACSecret: trimmedKey}, nil
}

func resolveServerBackupImportSecret(password string, encryptionKey string) string {
	if password != "" {
		return password
	}
	return encryptionKey
}

func resolveServerBackupArchiveSecrets(manifest models.ServerMigrationManifest, password string, encryptionKey string) serverBackupSecrets {
	if strings.TrimSpace(manifest.ConfidentialityMode) == serverBackupConfidentialityEncrypted {
		secret := resolveServerBackupImportSecret(password, encryptionKey)
		return serverBackupSecrets{PayloadSecret: secret, HMACSecret: secret}
	}
	return serverBackupSecrets{HMACSecret: strings.TrimSpace(encryptionKey)}
}

func backupSecretProvidedByPassword(payloadSecret string, encryptionKey string) bool {
	return payloadSecret != "" && payloadSecret != encryptionKey
}

func buildServerBackupArchiveManifest(manifest models.ServerMigrationManifest, hmacSecret string) serverBackupArchiveManifest {
	archiveManifest := serverBackupArchiveManifest{ServerMigrationManifest: manifest}
	archiveManifest.PayloadHMACSHA256 = buildServerBackupPayloadHMAC(archiveManifest, hmacSecret)
	return archiveManifest
}

func buildEncryptedServerBackupArchiveManifest(manifest models.ServerMigrationManifest, hmacSecret string) (serverBackupArchiveManifest, error) {
	salt := make([]byte, serverBackupPayloadSaltBytesV2)
	if _, err := rand.Read(salt); err != nil {
		return serverBackupArchiveManifest{}, err
	}
	nonce := make([]byte, serverBackupPayloadNonceBytesV2)
	if _, err := rand.Read(nonce); err != nil {
		return serverBackupArchiveManifest{}, err
	}
	archiveManifest := serverBackupArchiveManifest{
		ServerMigrationManifest:    manifest,
		PayloadEncryptionVersion:   serverBackupPayloadEncryptionV2,
		PayloadEncryptionCipher:    serverBackupPayloadCipherV2,
		PayloadEncryptionKDF:       serverBackupPayloadKDFV2,
		PayloadEncryptionKDFIters:  serverBackupPayloadKDFIterationsV2,
		PayloadEncryptionSalt:      hex.EncodeToString(salt),
		PayloadEncryptionNonce:     hex.EncodeToString(nonce),
		PayloadEncryptionChunkSize: serverBackupPayloadChunkBytesV2,
	}
	archiveManifest.PayloadHMACSHA256 = buildServerBackupPayloadHMAC(archiveManifest, hmacSecret)
	return archiveManifest, nil
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

func buildServerBackupPayloadHMAC(archiveManifest serverBackupArchiveManifest, hmacSecret string) string {
	key := strings.TrimSpace(hmacSecret)
	manifest := archiveManifest.ServerMigrationManifest
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
	if strings.TrimSpace(archiveManifest.PayloadEncryptionVersion) != "" {
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, strings.TrimSpace(archiveManifest.PayloadEncryptionVersion))
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, strings.TrimSpace(archiveManifest.PayloadEncryptionCipher))
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, strings.TrimSpace(archiveManifest.PayloadEncryptionKDF))
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, fmt.Sprintf("%d", archiveManifest.PayloadEncryptionKDFIters))
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, strings.TrimSpace(archiveManifest.PayloadEncryptionSalt))
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, strings.TrimSpace(archiveManifest.PayloadEncryptionNonce))
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, fmt.Sprintf("%d", archiveManifest.PayloadEncryptionChunkSize))
	} else if strings.TrimSpace(archiveManifest.PayloadEncryptionIV) != "" {
		_, _ = io.WriteString(mac, "\n")
		_, _ = io.WriteString(mac, strings.TrimSpace(archiveManifest.PayloadEncryptionIV))
	}
	return hex.EncodeToString(mac.Sum(nil))
}

func deriveServerBackupCipherKey(encryptionKey string) []byte {
	sum := sha256.Sum256([]byte("s3desk-backup-payload:v1\n" + strings.TrimSpace(encryptionKey)))
	return sum[:]
}

func serverBackupPayloadAEADV2(archiveManifest serverBackupArchiveManifest, encryptionKey string) (cipher.AEAD, []byte, int, error) {
	if strings.TrimSpace(archiveManifest.PayloadEncryptionVersion) != serverBackupPayloadEncryptionV2 {
		return nil, nil, 0, fmt.Errorf("unsupported payload encryption version %q", archiveManifest.PayloadEncryptionVersion)
	}
	if strings.TrimSpace(archiveManifest.PayloadEncryptionCipher) != serverBackupPayloadCipherV2 {
		return nil, nil, 0, fmt.Errorf("unsupported payload encryption cipher %q", archiveManifest.PayloadEncryptionCipher)
	}
	if strings.TrimSpace(archiveManifest.PayloadEncryptionKDF) != serverBackupPayloadKDFV2 {
		return nil, nil, 0, fmt.Errorf("unsupported payload encryption KDF %q", archiveManifest.PayloadEncryptionKDF)
	}
	if archiveManifest.PayloadEncryptionKDFIters <= 0 || archiveManifest.PayloadEncryptionKDFIters > serverBackupPayloadMaxKDFIterationsV2 {
		return nil, nil, 0, fmt.Errorf("invalid payload encryption KDF iteration count %d", archiveManifest.PayloadEncryptionKDFIters)
	}
	chunkSize := archiveManifest.PayloadEncryptionChunkSize
	if chunkSize <= 0 || chunkSize > serverBackupPayloadMaxChunkBytesV2 {
		return nil, nil, 0, fmt.Errorf("invalid payload encryption chunk size %d", chunkSize)
	}
	salt, err := decodeServerBackupPayloadHex("salt", archiveManifest.PayloadEncryptionSalt, serverBackupPayloadSaltBytesV2)
	if err != nil {
		return nil, nil, 0, err
	}
	nonce, err := decodeServerBackupPayloadHex("nonce", archiveManifest.PayloadEncryptionNonce, serverBackupPayloadNonceBytesV2)
	if err != nil {
		return nil, nil, 0, err
	}
	key, err := pbkdf2.Key(sha256.New, strings.TrimSpace(encryptionKey), salt, archiveManifest.PayloadEncryptionKDFIters, 32)
	if err != nil {
		return nil, nil, 0, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, 0, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, 0, err
	}
	if aead.NonceSize() != len(nonce) {
		return nil, nil, 0, fmt.Errorf("payload encryption nonce length %d does not match cipher nonce size %d", len(nonce), aead.NonceSize())
	}
	return aead, nonce, chunkSize, nil
}

func decodeServerBackupPayloadHex(name string, value string, wantBytes int) ([]byte, error) {
	decoded, err := hex.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return nil, fmt.Errorf("invalid payload encryption %s: %w", name, err)
	}
	if len(decoded) != wantBytes {
		return nil, fmt.Errorf("invalid payload encryption %s length %d", name, len(decoded))
	}
	return decoded, nil
}

func serverBackupPayloadChunkNonce(baseNonce []byte, counter uint64) []byte {
	nonce := append([]byte(nil), baseNonce...)
	binary.BigEndian.PutUint64(nonce[len(nonce)-8:], counter)
	return nonce
}

func writeServerBackupPayloadFrame(w io.Writer, frame []byte) error {
	if len(frame) == 0 {
		return errors.New("empty encrypted backup payload frame")
	}
	frameLen := uint64(len(frame))
	if frameLen > uint64(^uint32(0)) {
		return fmt.Errorf("encrypted backup payload frame too large: %d", len(frame))
	}
	var size [4]byte
	binary.BigEndian.PutUint32(size[:], uint32(frameLen)) // #nosec G115 -- frameLen is bounded to uint32 above.
	if _, err := w.Write(size[:]); err != nil {
		return err
	}
	_, err := w.Write(frame)
	return err
}

func readServerBackupPayloadFrame(r io.Reader, maxFrameSize int) ([]byte, error) {
	var size [4]byte
	if _, err := io.ReadFull(r, size[:]); err != nil {
		if errors.Is(err, io.EOF) {
			return nil, io.EOF
		}
		return nil, fmt.Errorf("truncated encrypted backup payload frame header: %w", err)
	}
	frameSize := int(binary.BigEndian.Uint32(size[:]))
	if frameSize <= 0 || frameSize > maxFrameSize {
		return nil, fmt.Errorf("invalid encrypted backup payload frame size %d", frameSize)
	}
	frame := make([]byte, frameSize)
	if _, err := io.ReadFull(r, frame); err != nil {
		return nil, fmt.Errorf("truncated encrypted backup payload frame: %w", err)
	}
	return frame, nil
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

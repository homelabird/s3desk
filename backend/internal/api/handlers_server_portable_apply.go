package api

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

type portableImportApplyStore interface {
	ImportPortableEntityFilesReplace(ctx context.Context, entityFiles map[string][]byte, dataDir string) (store.PortableImportCounts, error)
	Ping(ctx context.Context) error
}

type portableImportPreflightService struct {
	dataDir       string
	encryptionKey string
	diskCheck     func(path string) (int64, error)
}

type portableImportApplyService struct {
	store   portableImportApplyStore
	dataDir string
}

func newPortableImportPreflightService(dataDir, encryptionKey string) portableImportPreflightService {
	return portableImportPreflightService{
		dataDir:       dataDir,
		encryptionKey: encryptionKey,
		diskCheck:     availableDiskBytes,
	}
}

func newPortableImportApplyService(st portableImportApplyStore, dataDir string) portableImportApplyService {
	return portableImportApplyService{
		store:   st,
		dataDir: dataDir,
	}
}

func (s *server) buildPortableImportResponse(
	mode string,
	dbBackend db.Backend,
	manifest models.ServerMigrationManifest,
	entityFiles map[string][]byte,
) models.ServerPortableImportResponse {
	return newPortableImportPreflightService(s.cfg.DataDir, s.cfg.EncryptionKey).buildResponse(mode, dbBackend, manifest, entityFiles)
}

func (svc portableImportPreflightService) buildResponse(
	mode string,
	dbBackend db.Backend,
	manifest models.ServerMigrationManifest,
	entityFiles map[string][]byte,
) models.ServerPortableImportResponse {
	preflight := models.ServerPortableImportPreflight{
		SchemaReady:               manifest.FormatVersion == portableBackupFormatVersion && manifest.SchemaVersion == portableBackupSchemaVersion,
		EncryptionReady:           !manifest.EncryptionEnabled || strings.TrimSpace(svc.encryptionKey) != "",
		EncryptionKeyHintVerified: !manifest.EncryptionEnabled || manifest.EncryptionKeyHint == "" || manifest.EncryptionKeyHint == portableBackupEncryptionKeyHint(svc.encryptionKey),
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
		freeBytes, diskErr := svc.diskCheck(svc.dataDir)
		if diskErr != nil {
			preflight.SpaceReady = false
			preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Failed to check disk space for thumbnail assets: %v", diskErr))
		} else if freeBytes < assetSummary.Bytes {
			preflight.SpaceReady = false
			preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Need %d bytes free for thumbnail assets, only %d available.", assetSummary.Bytes, freeBytes))
		}
	}

	entityVerification := buildPortableImportEntityVerification(manifest.Entities, entityFiles)
	preflight.Blockers = append(preflight.Blockers, entityVerification.blockers...)
	return buildPortableImportResponseBody(mode, dbBackend, manifest, preflight, entityVerification)
}

func (s *server) applyPortableImportPayload(
	ctx context.Context,
	resp *models.ServerPortableImportResponse,
	entityFiles map[string][]byte,
	assetRoot string,
) error {
	return newPortableImportApplyService(s.store, s.cfg.DataDir).apply(ctx, resp, entityFiles, assetRoot)
}

func (svc portableImportApplyService) apply(
	ctx context.Context,
	resp *models.ServerPortableImportResponse,
	entityFiles map[string][]byte,
	assetRoot string,
) error {
	counts, err := svc.replaceEntities(ctx, entityFiles)
	if err != nil {
		return err
	}
	resp.Entities = applyPortableImportCounts(resp.Entities, counts)
	svc.applyAssets(resp, assetRoot)
	svc.finalizeResponse(ctx, resp)
	return nil
}

func (svc portableImportApplyService) replaceEntities(ctx context.Context, entityFiles map[string][]byte) (store.PortableImportCounts, error) {
	return svc.store.ImportPortableEntityFilesReplace(ctx, entityFiles, svc.dataDir)
}

func (svc portableImportApplyService) applyAssets(resp *models.ServerPortableImportResponse, assetRoot string) {
	if assetRoot == "" {
		return
	}
	thumbnailsPath := filepath.Join(assetRoot, portableAssetKeyThumbnails)
	info, statErr := os.Stat(thumbnailsPath)
	if statErr != nil || !info.IsDir() {
		return
	}

	assetTargetDir := filepath.Join(svc.dataDir, portableAssetKeyThumbnails)
	if err := os.RemoveAll(assetTargetDir); err != nil {
		resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but failed to reset thumbnail assets: %v", err))
		return
	}
	if err := copyPortableAssetTree(thumbnailsPath, assetTargetDir); err != nil {
		resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but failed to copy thumbnail assets: %v", err))
		return
	}
	resp.AssetStagingDir = assetTargetDir
}

func (svc portableImportApplyService) finalizeResponse(ctx context.Context, resp *models.ServerPortableImportResponse) {
	if err := svc.store.Ping(ctx); err == nil {
		resp.Verification.PostImportHealthCheckPassed = true
	} else {
		resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but post-import health check failed: %v", err))
	}
	if !verifyPortableImportCounts(resp.Entities) {
		resp.Warnings = append(resp.Warnings, "Imported row counts did not match the manifest counts for one or more entities.")
	}
}

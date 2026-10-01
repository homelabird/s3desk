package api

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

type portableImportApplyStore interface {
	ImportPortableEntityFilesReplaceWithRecovery(ctx context.Context, entityFiles map[string][]byte, dataDir string, opts store.PortableValidationOptions, beforeReplace func(store.PortableExportBundle) error) (store.PortableImportCounts, error)
	Ping(ctx context.Context) error
}

type portableImportPreflightService struct {
	dataDir       string
	encryptionKey string
	allowRemote   bool
	diskCheck     func(path string) (int64, error)
}

type portableImportApplyService struct {
	store               portableImportApplyStore
	dataDir             string
	allowRemote         bool
	writeRecoveryBundle func(context.Context, string, store.PortableExportBundle) error
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
	svc := newPortableImportPreflightService(s.cfg.DataDir, s.cfg.EncryptionKey)
	svc.allowRemote = s.cfg.AllowRemote
	return svc.buildResponse(mode, dbBackend, manifest, entityFiles)
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
		EncryptionKeyHintVerified: portableImportEncryptionKeyHintMatches(manifest, svc.encryptionKey),
		SpaceReady:                true,
	}
	if manifest.FormatVersion != portableBackupFormatVersion {
		preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Portable bundle formatVersion %d is unsupported; expected %d.", manifest.FormatVersion, portableBackupFormatVersion))
	}
	if manifest.SchemaVersion != portableBackupSchemaVersion {
		preflight.Blockers = append(preflight.Blockers, fmt.Sprintf("Portable bundle schemaVersion %d is unsupported; expected %d.", manifest.SchemaVersion, portableBackupSchemaVersion))
	}
	if !preflight.EncryptionReady {
		preflight.Blockers = append(preflight.Blockers, "Destination server is missing "+portableImportDestinationKeyEnv+" required by the portable bundle.")
	}
	if manifest.EncryptionEnabled && manifest.EncryptionKeyHint != "" && !preflight.EncryptionKeyHintVerified {
		preflight.Blockers = append(preflight.Blockers, "Destination "+portableImportDestinationKeyEnv+" does not match the portable bundle encryption fingerprint.")
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

	entityVerification := buildPortableImportEntityVerificationWithOptions(
		manifest.Entities,
		entityFiles,
		svc.dataDir,
		store.PortableValidationOptions{AllowRemote: svc.allowRemote},
	)
	preflight.Blockers = append(preflight.Blockers, entityVerification.blockers...)
	return buildPortableImportResponseBody(mode, dbBackend, manifest, preflight, entityVerification)
}

func (s *server) applyPortableImportPayload(
	ctx context.Context,
	resp *models.ServerPortableImportResponse,
	entityFiles map[string][]byte,
	assetRoot string,
) error {
	svc := newPortableImportApplyService(s.store, s.cfg.DataDir)
	svc.allowRemote = s.cfg.AllowRemote
	svc.writeRecoveryBundle = func(ctx context.Context, path string, bundle store.PortableExportBundle) error {
		confidentiality := serverBackupConfidentialityClear
		if s.cfg.EncryptionKey != "" {
			confidentiality = serverBackupConfidentialityEncrypted
		}
		secrets, err := resolveServerBackupExportSecrets(confidentiality, "", s.cfg.EncryptionKey)
		if err != nil {
			return err
		}
		_, err = s.writePortableServerBackupArchiveFromBundle(ctx, path, confidentiality, true, secrets, bundle)
		return err
	}
	return svc.apply(ctx, resp, entityFiles, assetRoot)
}

func (svc portableImportApplyService) apply(
	ctx context.Context,
	resp *models.ServerPortableImportResponse,
	entityFiles map[string][]byte,
	assetRoot string,
) error {
	preparedRoot, err := svc.prepareAssets(assetRoot)
	if err != nil {
		return err
	}
	if preparedRoot != "" {
		defer func() {
			if resp.AssetRecoveryDir == "" {
				_ = os.RemoveAll(preparedRoot)
			}
		}()
	}
	recovery, err := newPortableImportRecovery(svc.dataDir, preparedRoot)
	if err != nil {
		return err
	}
	recovery.record.IncomingPayloadSHA256 = resp.Manifest.PayloadSHA256
	saved := false
	defer func() {
		if !saved {
			_ = os.RemoveAll(recovery.dir)
		}
	}()
	if svc.writeRecoveryBundle == nil {
		return errors.New("portable import recovery writer is missing")
	}
	counts, err := svc.store.ImportPortableEntityFilesReplaceWithRecovery(ctx, entityFiles, svc.dataDir, store.PortableValidationOptions{AllowRemote: svc.allowRemote}, func(bundle store.PortableExportBundle) error {
		if err := svc.writeRecoveryBundle(ctx, recovery.record.RecoveryBundlePath, bundle); err != nil {
			return fmt.Errorf("save pre-import recovery bundle: %w", err)
		}
		if err := syncPortableRecoveryPath(recovery.record.RecoveryBundlePath); err != nil {
			return err
		}
		recovery.record.Phase = "commit_unknown"
		if err := recovery.save(); err != nil {
			return err
		}
		saved = true
		return nil
	})
	if err != nil {
		if saved {
			return fmt.Errorf("portable import outcome requires inspection of %s: %w", recovery.dir, err)
		}
		return err
	}
	resp.RecoveryDir = recovery.dir
	resp.RecoveryBundlePath = recovery.record.RecoveryBundlePath
	recovery.record.Phase = "database_committed"
	journalErr := recovery.save()
	resp.Entities = applyPortableImportCounts(resp.Entities, counts)
	resp.Status = "complete"
	svc.applyAssets(resp, preparedRoot)
	svc.finalizeResponse(ctx, resp)
	if journalErr != nil {
		resp.Status = "partial"
		resp.Warnings = append(resp.Warnings, "Database replacement committed, but its intermediate recovery record could not be saved.")
	}
	recovery.record.Phase = resp.Status
	recovery.record.Result = resp
	if err := recovery.save(); err != nil {
		resp.Status = "partial"
		resp.Warnings = append(resp.Warnings, "Database replacement committed, but its final recovery record could not be saved. Inspect the database and recovery directory before retrying.")
		recovery.record.Phase = "partial"
		_ = recovery.save() // Best effort to record the warning if rename succeeded but directory sync failed.
	}
	return nil
}

func (svc portableImportApplyService) prepareAssets(assetRoot string) (string, error) {
	if assetRoot == "" {
		return "", nil
	}
	thumbnailsPath := filepath.Join(assetRoot, portableAssetKeyThumbnails)
	info, err := os.Stat(thumbnailsPath)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("thumbnail assets are not a directory")
	}
	preparedRoot, err := os.MkdirTemp(svc.dataDir, ".portable-thumbnails-*")
	if err != nil {
		return "", fmt.Errorf("prepare thumbnail assets before database import: %w", err)
	}
	if err := copyPortableAssetTree(thumbnailsPath, filepath.Join(preparedRoot, portableAssetKeyThumbnails)); err != nil {
		_ = os.RemoveAll(preparedRoot)
		return "", fmt.Errorf("prepare thumbnail assets before database import: %w", err)
	}
	if err := syncPortableRecoveryPath(preparedRoot); err != nil {
		_ = os.RemoveAll(preparedRoot)
		return "", fmt.Errorf("prepare thumbnail assets before database import: %w", err)
	}
	return preparedRoot, nil
}

func (svc portableImportApplyService) applyAssets(resp *models.ServerPortableImportResponse, preparedRoot string) {
	if preparedRoot == "" {
		return
	}
	assetTargetDir := filepath.Join(svc.dataDir, portableAssetKeyThumbnails)
	previousPath := filepath.Join(preparedRoot, "previous")
	hadPrevious := false
	if _, err := os.Stat(assetTargetDir); err == nil {
		if err := os.Rename(assetTargetDir, previousPath); err != nil {
			resp.Status = "partial"
			resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but kept previous thumbnail assets because replacement failed: %v", err))
			return
		}
		hadPrevious = true
	} else if !errors.Is(err, os.ErrNotExist) {
		resp.Status = "partial"
		resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but could not inspect thumbnail assets: %v", err))
		return
	}
	if err := os.Rename(filepath.Join(preparedRoot, portableAssetKeyThumbnails), assetTargetDir); err != nil {
		resp.Status = "partial"
		resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but failed to replace thumbnail assets: %v", err))
		if hadPrevious {
			if rollbackErr := os.Rename(previousPath, assetTargetDir); rollbackErr != nil {
				resp.AssetRecoveryDir = previousPath
				resp.Warnings = append(resp.Warnings, fmt.Sprintf("Previous thumbnail assets remain at %s because rollback failed: %v", previousPath, rollbackErr))
			}
		}
		return
	}
	resp.AssetStagingDir = assetTargetDir
	for _, path := range []string{preparedRoot, svc.dataDir} {
		if err := syncPortableRecoveryPath(path); err != nil {
			resp.Status = "partial"
			resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state and replaced thumbnails, but could not sync the asset directory: %v", err))
		}
	}
}

func (svc portableImportApplyService) finalizeResponse(ctx context.Context, resp *models.ServerPortableImportResponse) {
	if err := svc.store.Ping(ctx); err == nil {
		resp.Verification.PostImportHealthCheckPassed = true
	} else {
		resp.Status = "partial"
		resp.Warnings = append(resp.Warnings, fmt.Sprintf("Imported database state, but post-import health check failed: %v", err))
	}
	if !verifyPortableImportCounts(resp.Entities) {
		resp.Status = "partial"
		resp.Warnings = append(resp.Warnings, "Imported row counts did not match the manifest counts for one or more entities.")
	}
}

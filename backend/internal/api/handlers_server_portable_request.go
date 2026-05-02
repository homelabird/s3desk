package api

import (
	"context"
	"fmt"
	"io"
	"os"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

type portableImportArchiveOutcome string

const (
	portableImportArchiveOutcomeDryRun  portableImportArchiveOutcome = "dry_run"
	portableImportArchiveOutcomeBlocked portableImportArchiveOutcome = "blocked"
	portableImportArchiveOutcomeApplied portableImportArchiveOutcome = "applied"
)

type portableImportArchiveService struct {
	dbBackend     string
	extract       func(ctx context.Context, src io.Reader, backupPassword string, encryptionKey string) (string, models.ServerMigrationManifest, map[string][]byte, string, error)
	buildResponse func(
		mode string,
		dbBackend db.Backend,
		manifest models.ServerMigrationManifest,
		entityFiles map[string][]byte,
	) models.ServerPortableImportResponse
	applyPayload func(
		ctx context.Context,
		resp *models.ServerPortableImportResponse,
		entityFiles map[string][]byte,
		assetRoot string,
	) error
	cleanup func(path string) error
}

func newPortableImportArchiveService(s *server) portableImportArchiveService {
	return portableImportArchiveService{
		dbBackend: s.cfg.DBBackend,
		extract:   extractPortableImportArchiveBundle,
		buildResponse: func(mode string, dbBackend db.Backend, manifest models.ServerMigrationManifest, entityFiles map[string][]byte) models.ServerPortableImportResponse {
			return s.buildPortableImportResponse(mode, dbBackend, manifest, entityFiles)
		},
		applyPayload: func(ctx context.Context, resp *models.ServerPortableImportResponse, entityFiles map[string][]byte, assetRoot string) error {
			return s.applyPortableImportPayload(ctx, resp, entityFiles, assetRoot)
		},
		cleanup: os.RemoveAll,
	}
}

func (s *server) processPortableImportArchive(ctx context.Context, src io.Reader, mode string, backupPassword string, encryptionKey string) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error) {
	return newPortableImportArchiveService(s).process(ctx, src, mode, backupPassword, encryptionKey)
}

func (svc portableImportArchiveService) process(
	ctx context.Context,
	src io.Reader,
	mode string,
	backupPassword string,
	encryptionKey string,
) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error) {
	if mode != portableImportModeReplace && mode != portableImportModeDryRun {
		return models.ServerPortableImportResponse{}, "", fmt.Errorf("unsupported portable import mode %q", mode)
	}

	dbBackend, err := db.ParseBackend(svc.dbBackend)
	if err != nil {
		return models.ServerPortableImportResponse{}, "", err
	}

	tempRoot, manifest, entityFiles, assetRoot, err := svc.extract(ctx, src, backupPassword, encryptionKey)
	if err != nil {
		return models.ServerPortableImportResponse{}, "", err
	}
	if tempRoot != "" && svc.cleanup != nil {
		defer func() {
			_ = svc.cleanup(tempRoot)
		}()
	}

	resp := svc.buildResponse(mode, dbBackend, manifest, entityFiles)
	if mode == portableImportModeDryRun {
		return resp, portableImportArchiveOutcomeDryRun, nil
	}
	if len(resp.Preflight.Blockers) > 0 {
		return resp, portableImportArchiveOutcomeBlocked, nil
	}
	if err := svc.applyPayload(ctx, &resp, entityFiles, assetRoot); err != nil {
		return models.ServerPortableImportResponse{}, "", err
	}
	return resp, portableImportArchiveOutcomeApplied, nil
}

func extractPortableImportArchiveBundle(
	ctx context.Context,
	src io.Reader,
	backupPassword string,
	encryptionKey string,
) (string, models.ServerMigrationManifest, map[string][]byte, string, error) {
	tempRoot, manifest, entityFiles, assetRoot, _, err := extractPortableArchive(ctx, src, backupPassword, encryptionKey)
	if err != nil {
		return "", models.ServerMigrationManifest{}, nil, "", err
	}
	return tempRoot, manifest, entityFiles, assetRoot, nil
}

package api

import (
	"s3desk/internal/db"
	"s3desk/internal/models"
)

func buildPortableImportResponseBody(
	mode string,
	dbBackend db.Backend,
	manifest models.ServerMigrationManifest,
	preflight models.ServerPortableImportPreflight,
	entityVerification portableImportEntityVerification,
) models.ServerPortableImportResponse {
	status := "ready"
	if len(preflight.Blockers) > 0 {
		status = "blocked"
	}
	return models.ServerPortableImportResponse{
		Status:          status,
		Manifest:        manifest,
		Mode:            mode,
		TargetDBBackend: string(dbBackend),
		Preflight:       preflight,
		Entities:        entityVerification.results,
		Verification: models.ServerPortableImportVerification{
			EntityChecksumsVerified:     entityVerification.entityChecksumsVerified,
			PostImportHealthCheckPassed: false,
		},
		Warnings: append([]string(nil), manifest.Warnings...),
	}
}

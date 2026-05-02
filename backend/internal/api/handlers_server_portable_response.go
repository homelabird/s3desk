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
	return models.ServerPortableImportResponse{
		Manifest:        manifest,
		Mode:            mode,
		TargetDBBackend: string(dbBackend),
		Preflight:       preflight,
		Entities:        entityVerification.results,
		Verification: models.ServerPortableImportVerification{
			EntityChecksumsVerified:     entityVerification.entityChecksumsVerified,
			PostImportHealthCheckPassed: false,
		},
	}
}

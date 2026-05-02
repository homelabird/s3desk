package api

import (
	"net/http"

	cfgpkg "s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/version"
)

type metaHTTPService struct {
	server *server
}

func newMetaHTTPService(s *server) metaHTTPService {
	return metaHTTPService{server: s}
}

func buildMetaOptionalInt64(value int64) *int64 {
	if value <= 0 {
		return nil
	}
	v := value
	return &v
}

func buildMetaOptionalDurationSeconds(value int64) *int64 {
	if value <= 0 {
		return nil
	}
	v := value
	return &v
}

func buildMetaCapabilities(cfg cfgpkg.Config, dbBackend db.Backend) models.MetaCapabilities {
	tlsCapability := models.FeatureCapability{
		Enabled: cfg.EncryptionKey != "",
	}
	if !tlsCapability.Enabled {
		tlsCapability.Reason = "ENCRYPTION_KEY is required to store mTLS material"
	}

	serverBackupExport := models.FeatureCapability{
		Enabled: dbBackend == db.BackendSQLite || dbBackend == db.BackendPostgres,
	}
	switch dbBackend {
	case db.BackendPostgres:
		serverBackupExport.Reason = "Portable backup export is available. Full and Cache + metadata exports remain sqlite-only."
	case db.BackendSQLite:
		serverBackupExport.Reason = "Full, Cache + metadata, and Portable export are available on sqlite-backed servers."
	default:
		serverBackupExport.Reason = "In-product backup export currently supports sqlite and postgres-backed servers."
	}

	serverBackupRestoreStagingReason := "Stages a sqlite DATA_DIR bundle for manual cutover."
	serverBackupRestoreStaging := models.FeatureCapability{
		Enabled: true,
		Reason:  serverBackupRestoreStagingReason,
	}
	if dbBackend != db.BackendSQLite {
		serverBackupRestoreStaging.Reason = serverBackupRestoreStagingReason + " It does not replace a Postgres backup or restore workflow."
	}

	return models.MetaCapabilities{
		ProfileTLS: tlsCapability,
		ServerBackup: models.ServerBackupCapabilities{
			Export:         serverBackupExport,
			RestoreStaging: serverBackupRestoreStaging,
		},
		Providers: providerCapabilityMatrix(cfg.UploadDirectStream),
	}
}

func buildMetaTransferEngineInfo(r *http.Request) models.TransferEngineInfo {
	path, ok := jobs.DetectRclone()
	rcloneVersion, vok := jobs.DetectRcloneVersion(r.Context())
	compatible := false
	if ok && vok {
		compatible = jobs.IsRcloneVersionCompatible(rcloneVersion)
	}

	info := models.TransferEngineInfo{
		Name:       "rclone",
		Available:  ok,
		Compatible: compatible,
		MinVersion: jobs.MinSupportedRcloneVersion,
		Path:       path,
	}
	if vok {
		info.Version = rcloneVersion
	}
	return info
}

func (svc metaHTTPService) executeGet(r *http.Request) models.MetaResponse {
	dbBackend, err := db.ParseBackend(svc.server.cfg.DBBackend)
	if err != nil {
		dbBackend = db.BackendSQLite
	}

	resp := models.MetaResponse{
		Version:                 version.Version,
		ServerAddr:              svc.server.serverAddr,
		DataDir:                 svc.server.cfg.DataDir,
		DBBackend:               string(dbBackend),
		StaticDir:               svc.server.cfg.StaticDir,
		APITokenEnabled:         svc.server.cfg.APIToken != "",
		EncryptionEnabled:       svc.server.cfg.EncryptionKey != "",
		Warnings:                cfgpkg.OperationalWarnings(svc.server.cfg),
		Capabilities:            buildMetaCapabilities(svc.server.cfg, dbBackend),
		AllowedLocalDirs:        svc.server.cfg.AllowedLocalDirs,
		JobConcurrency:          svc.server.cfg.JobConcurrency,
		JobLogMaxBytes:          buildMetaOptionalInt64(svc.server.cfg.JobLogMaxBytes),
		JobRetentionSeconds:     buildMetaOptionalDurationSeconds(int64(svc.server.cfg.JobRetention.Seconds())),
		JobLogRetentionSeconds:  buildMetaOptionalDurationSeconds(int64(svc.server.cfg.JobLogRetention.Seconds())),
		UploadSessionTTLSeconds: int64(svc.server.cfg.UploadSessionTTL.Seconds()),
		UploadMaxBytes:          buildMetaOptionalInt64(svc.server.cfg.UploadMaxBytes),
		UploadDirectStream:      svc.server.cfg.UploadDirectStream,
		TransferEngine:          buildMetaTransferEngineInfo(r),
	}

	return resp
}

func (svc metaHTTPService) handleGetMeta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, svc.executeGet(r))
}

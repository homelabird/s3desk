package api

import (
	"net/http"

	cfgpkg "s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/version"
)

func (s *server) handleGetMeta(w http.ResponseWriter, r *http.Request) {
	dbBackend, err := db.ParseBackend(s.cfg.DBBackend)
	if err != nil {
		dbBackend = db.BackendSQLite
	}
	path, ok := jobs.DetectRclone()
	rcloneVersion, vok := jobs.DetectRcloneVersion(r.Context())
	compatible := false
	if ok && vok {
		compatible = jobs.IsRcloneVersionCompatible(rcloneVersion)
	}
	var jobLogMaxBytes *int64
	if s.cfg.JobLogMaxBytes > 0 {
		v := s.cfg.JobLogMaxBytes
		jobLogMaxBytes = &v
	}
	var jobRetentionSeconds *int64
	if s.cfg.JobRetention > 0 {
		v := int64(s.cfg.JobRetention.Seconds())
		jobRetentionSeconds = &v
	}
	var jobLogRetentionSeconds *int64
	if s.cfg.JobLogRetention > 0 {
		v := int64(s.cfg.JobLogRetention.Seconds())
		jobLogRetentionSeconds = &v
	}
	var uploadMaxBytes *int64
	if s.cfg.UploadMaxBytes > 0 {
		v := s.cfg.UploadMaxBytes
		uploadMaxBytes = &v
	}
	tlsCapability := models.FeatureCapability{
		Enabled: s.cfg.EncryptionKey != "",
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
	resp := models.MetaResponse{
		Version:           version.Version,
		ServerAddr:        s.serverAddr,
		DataDir:           s.cfg.DataDir,
		DBBackend:         string(dbBackend),
		StaticDir:         s.cfg.StaticDir,
		APITokenEnabled:   s.cfg.APIToken != "",
		EncryptionEnabled: s.cfg.EncryptionKey != "",
		Warnings:          cfgpkg.OperationalWarnings(s.cfg),
		Capabilities: models.MetaCapabilities{
			ProfileTLS: tlsCapability,
			ServerBackup: models.ServerBackupCapabilities{
				Export:         serverBackupExport,
				RestoreStaging: serverBackupRestoreStaging,
			},
			Providers: providerCapabilityMatrix(s.cfg.UploadDirectStream),
		},
		AllowedLocalDirs:        s.cfg.AllowedLocalDirs,
		JobConcurrency:          s.cfg.JobConcurrency,
		JobLogMaxBytes:          jobLogMaxBytes,
		JobRetentionSeconds:     jobRetentionSeconds,
		JobLogRetentionSeconds:  jobLogRetentionSeconds,
		UploadSessionTTLSeconds: int64(s.cfg.UploadSessionTTL.Seconds()),
		UploadMaxBytes:          uploadMaxBytes,
		UploadDirectStream:      s.cfg.UploadDirectStream,
		TransferEngine: models.TransferEngineInfo{
			Name:       "rclone",
			Available:  ok,
			Compatible: compatible,
			MinVersion: jobs.MinSupportedRcloneVersion,
			Path:       path,
			Version: func() string {
				if !vok {
					return ""
				}
				return rcloneVersion
			}(),
		},
	}
	writeJSON(w, http.StatusOK, resp)
}

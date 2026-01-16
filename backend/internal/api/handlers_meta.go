package api

import (
	"net/http"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/version"
)

func (s *server) handleGetMeta(w http.ResponseWriter, r *http.Request) {
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
	resp := models.MetaResponse{
		Version:                 version.Version,
		ServerAddr:              s.serverAddr,
		DataDir:                 s.cfg.DataDir,
		StaticDir:               s.cfg.StaticDir,
		APITokenEnabled:         s.cfg.APIToken != "",
		EncryptionEnabled:       s.cfg.EncryptionKey != "",
		Capabilities:            models.MetaCapabilities{ProfileTLS: tlsCapability},
		AllowedLocalDirs:        s.cfg.AllowedLocalDirs,
		JobConcurrency:          s.cfg.JobConcurrency,
		JobLogMaxBytes:          jobLogMaxBytes,
		JobRetentionSeconds:     jobRetentionSeconds,
		JobLogRetentionSeconds:  jobLogRetentionSeconds,
		UploadSessionTTLSeconds: int64(s.cfg.UploadSessionTTL.Seconds()),
		UploadMaxBytes:          uploadMaxBytes,
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

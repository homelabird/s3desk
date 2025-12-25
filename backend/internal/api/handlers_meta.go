package api

import (
	"net/http"

	"object-storage/internal/jobs"
	"object-storage/internal/models"
	"object-storage/internal/version"
)

func (s *server) handleGetMeta(w http.ResponseWriter, r *http.Request) {
	path, ok := jobs.DetectS5Cmd()
	s5cmdVersion, vok := jobs.DetectS5CmdVersion(r.Context())
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
		UploadSessionTTLSeconds: int64(s.cfg.UploadSessionTTL.Seconds()),
		UploadMaxBytes:          uploadMaxBytes,
		S5Cmd: models.S5CmdInfo{
			Available: ok,
			Path:      path,
			Version: func() string {
				if !vok {
					return ""
				}
				return s5cmdVersion
			}(),
		},
	}
	writeJSON(w, http.StatusOK, resp)
}

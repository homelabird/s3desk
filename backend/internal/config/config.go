package config

import "time"

type Config struct {
	Addr                               string
	DataDir                            string
	DBBackend                          string
	DatabaseURL                        string
	DBMaxOpenConns                     int
	DBMaxIdleConns                     int
	DBConnMaxLifetime                  time.Duration
	DBConnMaxIdleTime                  time.Duration
	LogFormat                          string
	LogLevel                           string
	StaticDir                          string
	APIToken                           string
	AllowRemote                        bool
	AllowedHosts                       []string
	EncryptionKey                      string
	AllowedLocalDirs                   []string
	JobConcurrency                     int
	JobLogMaxBytes                     int64
	JobLogEmitStdout                   bool
	JobRetention                       time.Duration
	JobLogRetention                    time.Duration
	UploadSessionTTL                   time.Duration
	UploadMaxBytes                     int64
	RcloneDownloadMultiThreadStreams   int
	RcloneDownloadMultiThreadCutoffMiB int
	RcloneDownloadBufferSizeMiB        int
}

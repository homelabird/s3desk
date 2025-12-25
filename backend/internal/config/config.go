package config

import "time"

type Config struct {
	Addr             string
	DataDir          string
	StaticDir        string
	APIToken         string
	AllowRemote      bool
	AllowedHosts     []string
	EncryptionKey    string
	AllowedLocalDirs []string
	JobConcurrency   int
	JobLogMaxBytes   int64
	JobRetention     time.Duration
	UploadSessionTTL time.Duration
	UploadMaxBytes   int64
}

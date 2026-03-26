package jobs

import (
	"math/rand"
	"path/filepath"
	"runtime"
	"time"
)

type managerWiringConfig struct {
	concurrency                int
	queueCapacity              int
	logLineMaxBytes            int
	allowedLocalDirs           []string
	rcloneTuneEnabled          bool
	rcloneMaxTransfers         int
	rcloneMaxCheckers          int
	rcloneS3ChunkSizeMiB       int
	rcloneS3UploadConcurrency  int
	rcloneLowLevelRetries      int
	rcloneStatsInterval        time.Duration
	rcloneRetryAttempts        int
	rcloneRetryBaseDelay       time.Duration
	rcloneRetryMaxDelay        time.Duration
	rcloneRetryJitterRatio     float64
	rcloneRetryRandFloat       func() float64
	captureUnknownRcloneErrors bool
}

func resolveManagerWiring(cfg Config) (managerWiringConfig, error) {
	concurrency := cfg.Concurrency
	if concurrency <= 0 {
		concurrency = 1
	}

	queueCapacity, err := lookupEnvInt("JOB_QUEUE_CAPACITY", defaultJobQueueCapacity)
	if err != nil {
		return managerWiringConfig{}, err
	}
	if queueCapacity < 1 {
		queueCapacity = defaultJobQueueCapacity
	}

	logLineMaxBytes, err := lookupEnvInt("JOB_LOG_MAX_LINE_BYTES", defaultMaxLogLineBytes)
	if err != nil {
		return managerWiringConfig{}, err
	}
	if logLineMaxBytes < 1 {
		logLineMaxBytes = defaultMaxLogLineBytes
	}

	statsInterval, err := lookupEnvDuration("RCLONE_STATS_INTERVAL", jobProgressTick)
	if err != nil {
		return managerWiringConfig{}, err
	}
	if statsInterval < 500*time.Millisecond {
		statsInterval = 500 * time.Millisecond
	}

	retryAttempts, err := lookupEnvInt("RCLONE_RETRY_ATTEMPTS", 3)
	if err != nil {
		return managerWiringConfig{}, err
	}
	if retryAttempts < 1 {
		retryAttempts = 1
	}
	retryBaseDelay, err := lookupEnvDuration("RCLONE_RETRY_BASE_DELAY", 800*time.Millisecond)
	if err != nil {
		return managerWiringConfig{}, err
	}
	if retryBaseDelay < 0 {
		retryBaseDelay = 0
	}
	retryMaxDelay, err := lookupEnvDuration("RCLONE_RETRY_MAX_DELAY", 8*time.Second)
	if err != nil {
		return managerWiringConfig{}, err
	}
	if retryMaxDelay < retryBaseDelay {
		retryMaxDelay = retryBaseDelay
	}

	rcloneTuneEnabled, err := lookupEnvBool("RCLONE_TUNE", true)
	if err != nil {
		return managerWiringConfig{}, err
	}
	rcloneMaxTransfers, err := defaultRcloneMaxTransfers()
	if err != nil {
		return managerWiringConfig{}, err
	}
	rcloneMaxCheckers, err := defaultRcloneMaxCheckers()
	if err != nil {
		return managerWiringConfig{}, err
	}
	rcloneS3ChunkSizeMiB, err := lookupEnvInt("RCLONE_S3_CHUNK_SIZE_MIB", 0)
	if err != nil {
		return managerWiringConfig{}, err
	}
	rcloneS3UploadConcurrency, err := lookupEnvInt("RCLONE_S3_UPLOAD_CONCURRENCY", 0)
	if err != nil {
		return managerWiringConfig{}, err
	}
	rcloneLowLevelRetries, err := lookupEnvInt("RCLONE_LOW_LEVEL_RETRIES", 10)
	if err != nil {
		return managerWiringConfig{}, err
	}
	rcloneRetryJitterRatio, err := lookupEnvFloat("RCLONE_RETRY_JITTER_RATIO", 0.2)
	if err != nil {
		return managerWiringConfig{}, err
	}
	captureUnknownRcloneErrors, err := lookupEnvBool("RCLONE_CAPTURE_UNKNOWN_ERRORS", false)
	if err != nil {
		return managerWiringConfig{}, err
	}

	return managerWiringConfig{
		concurrency:                concurrency,
		queueCapacity:              queueCapacity,
		logLineMaxBytes:            logLineMaxBytes,
		allowedLocalDirs:           sanitizeAllowedLocalDirs(cfg.AllowedLocalDirs),
		rcloneTuneEnabled:          rcloneTuneEnabled,
		rcloneMaxTransfers:         rcloneMaxTransfers,
		rcloneMaxCheckers:          rcloneMaxCheckers,
		rcloneS3ChunkSizeMiB:       rcloneS3ChunkSizeMiB,
		rcloneS3UploadConcurrency:  rcloneS3UploadConcurrency,
		rcloneLowLevelRetries:      rcloneLowLevelRetries,
		rcloneStatsInterval:        statsInterval,
		rcloneRetryAttempts:        retryAttempts,
		rcloneRetryBaseDelay:       retryBaseDelay,
		rcloneRetryMaxDelay:        retryMaxDelay,
		rcloneRetryJitterRatio:     clampRetryJitterRatio(rcloneRetryJitterRatio),
		rcloneRetryRandFloat:       rand.Float64,
		captureUnknownRcloneErrors: captureUnknownRcloneErrors,
	}, nil
}

func sanitizeAllowedLocalDirs(dirs []string) []string {
	if len(dirs) == 0 {
		return nil
	}
	out := make([]string, 0, len(dirs))
	for _, d := range dirs {
		d = filepath.Clean(d)
		if d == "" || d == "." {
			continue
		}
		out = append(out, d)
	}
	return out
}

func defaultRcloneMaxTransfers() (int, error) {
	cpu := runtime.NumCPU()
	maxTransfers := cpu * 4
	if maxTransfers < 4 {
		maxTransfers = 4
	}
	if maxTransfers > 128 {
		maxTransfers = 128
	}
	return lookupEnvInt("RCLONE_MAX_TRANSFERS", maxTransfers)
}

func defaultRcloneMaxCheckers() (int, error) {
	cpu := runtime.NumCPU()
	maxCheckers := cpu * 8
	if maxCheckers < 8 {
		maxCheckers = 8
	}
	if maxCheckers > 256 {
		maxCheckers = 256
	}
	return lookupEnvInt("RCLONE_MAX_CHECKERS", maxCheckers)
}

func clampRetryJitterRatio(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

func ValidateEnvironment(cfg Config) error {
	_, err := resolveManagerWiring(cfg)
	return err
}

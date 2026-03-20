package jobs

import (
	"math/rand"
	"path/filepath"
	"runtime"
	"time"
)

type managerWiringConfig struct {
	concurrency                 int
	queueCapacity               int
	logLineMaxBytes             int
	allowedLocalDirs            []string
	rcloneTuneEnabled           bool
	rcloneMaxTransfers          int
	rcloneMaxCheckers           int
	rcloneS3ChunkSizeMiB        int
	rcloneS3UploadConcurrency   int
	rcloneLowLevelRetries       int
	rcloneStatsInterval         time.Duration
	rcloneRetryAttempts         int
	rcloneRetryBaseDelay        time.Duration
	rcloneRetryMaxDelay         time.Duration
	rcloneRetryJitterRatio      float64
	rcloneRetryRandFloat        func() float64
	captureUnknownRcloneErrors  bool
}

func resolveManagerWiring(cfg Config) managerWiringConfig {
	concurrency := cfg.Concurrency
	if concurrency <= 0 {
		concurrency = 1
	}

	queueCapacity := envInt("JOB_QUEUE_CAPACITY", defaultJobQueueCapacity)
	if queueCapacity < 1 {
		queueCapacity = defaultJobQueueCapacity
	}

	logLineMaxBytes := envInt("JOB_LOG_MAX_LINE_BYTES", defaultMaxLogLineBytes)
	if logLineMaxBytes < 1 {
		logLineMaxBytes = defaultMaxLogLineBytes
	}

	statsInterval := envDuration("RCLONE_STATS_INTERVAL", jobProgressTick)
	if statsInterval < 500*time.Millisecond {
		statsInterval = 500 * time.Millisecond
	}

	retryAttempts := envInt("RCLONE_RETRY_ATTEMPTS", 3)
	if retryAttempts < 1 {
		retryAttempts = 1
	}
	retryBaseDelay := envDuration("RCLONE_RETRY_BASE_DELAY", 800*time.Millisecond)
	if retryBaseDelay < 0 {
		retryBaseDelay = 0
	}
	retryMaxDelay := envDuration("RCLONE_RETRY_MAX_DELAY", 8*time.Second)
	if retryMaxDelay < retryBaseDelay {
		retryMaxDelay = retryBaseDelay
	}

	return managerWiringConfig{
		concurrency:                concurrency,
		queueCapacity:              queueCapacity,
		logLineMaxBytes:            logLineMaxBytes,
		allowedLocalDirs:           sanitizeAllowedLocalDirs(cfg.AllowedLocalDirs),
		rcloneTuneEnabled:          envBool("RCLONE_TUNE", true),
		rcloneMaxTransfers:         defaultRcloneMaxTransfers(),
		rcloneMaxCheckers:          defaultRcloneMaxCheckers(),
		rcloneS3ChunkSizeMiB:       envInt("RCLONE_S3_CHUNK_SIZE_MIB", 0),
		rcloneS3UploadConcurrency:  envInt("RCLONE_S3_UPLOAD_CONCURRENCY", 0),
		rcloneLowLevelRetries:      envInt("RCLONE_LOW_LEVEL_RETRIES", 10),
		rcloneStatsInterval:        statsInterval,
		rcloneRetryAttempts:        retryAttempts,
		rcloneRetryBaseDelay:       retryBaseDelay,
		rcloneRetryMaxDelay:        retryMaxDelay,
		rcloneRetryJitterRatio:     clampRetryJitterRatio(envFloat("RCLONE_RETRY_JITTER_RATIO", 0.2)),
		rcloneRetryRandFloat:       rand.Float64,
		captureUnknownRcloneErrors: envBool("RCLONE_CAPTURE_UNKNOWN_ERRORS", false),
	}
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

func defaultRcloneMaxTransfers() int {
	cpu := runtime.NumCPU()
	maxTransfers := cpu * 4
	if maxTransfers < 4 {
		maxTransfers = 4
	}
	if maxTransfers > 128 {
		maxTransfers = 128
	}
	return envInt("RCLONE_MAX_TRANSFERS", maxTransfers)
}

func defaultRcloneMaxCheckers() int {
	cpu := runtime.NumCPU()
	maxCheckers := cpu * 8
	if maxCheckers < 8 {
		maxCheckers = 8
	}
	if maxCheckers > 256 {
		maxCheckers = 256
	}
	return envInt("RCLONE_MAX_CHECKERS", maxCheckers)
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

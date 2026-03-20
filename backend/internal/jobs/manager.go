package jobs

import (
	"context"
	"errors"
	"sync"
	"time"

	"s3desk/internal/logging"
	"s3desk/internal/metrics"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

const (
	JobTypeTransferSyncLocalToS3   = "transfer_sync_local_to_s3"
	JobTypeTransferSyncStagingToS3 = "transfer_sync_staging_to_s3"
	JobTypeTransferDirectUpload    = "transfer_direct_upload"
	JobTypeTransferSyncS3ToLocal   = "transfer_sync_s3_to_local"
	JobTypeTransferDeletePrefix    = "transfer_delete_prefix"
	JobTypeTransferCopyObject      = "transfer_copy_object"
	JobTypeTransferMoveObject      = "transfer_move_object"
	JobTypeTransferCopyBatch       = "transfer_copy_batch"
	JobTypeTransferMoveBatch       = "transfer_move_batch"
	JobTypeTransferCopyPrefix      = "transfer_copy_prefix"
	JobTypeTransferMovePrefix      = "transfer_move_prefix"
	JobTypeS3ZipPrefix             = "s3_zip_prefix"
	JobTypeS3ZipObjects            = "s3_zip_objects"
	JobTypeS3DeleteObjects         = "s3_delete_objects"
	JobTypeS3IndexObjects          = "s3_index_objects"
)

const (
	defaultJobQueueCapacity = 256
	defaultMaxLogLineBytes  = 256 * 1024
	jobProgressTick         = 2 * time.Second
)

var ErrJobQueueFull = errors.New("job queue is full")

type Config struct {
	Store            *store.Store
	DataDir          string
	Hub              *ws.Hub
	Metrics          *metrics.Metrics
	Concurrency      int
	JobLogMaxBytes   int64
	JobLogEmitStdout bool
	JobRetention     time.Duration
	JobLogRetention  time.Duration
	AllowedLocalDirs []string
	UploadSessionTTL time.Duration
}

type Manager struct {
	store           *store.Store
	dataDir         string
	hub             *ws.Hub
	metrics         *metrics.Metrics
	logMaxBytes     int64
	logEmitStdout   bool
	jobRetention    time.Duration
	jobLogRetention time.Duration

	queueMu       sync.Mutex
	queueCond     *sync.Cond
	queue         []string
	queueCapacity int
	sem           chan struct{}

	mu      sync.Mutex
	cancels map[string]context.CancelFunc
	pids    map[string]int

	uploadTTL time.Duration

	allowedLocalDirs []string
	logLineMaxBytes  int

	rcloneTuneEnabled         bool
	rcloneMaxTransfers        int
	rcloneMaxCheckers         int
	rcloneS3ChunkSizeMiB      int
	rcloneS3UploadConcurrency int
	rcloneLowLevelRetries     int
	rcloneStatsInterval       time.Duration

	// Retry/backoff for transient rclone failures (rate limit, network, timeouts).
	rcloneRetryAttempts    int
	rcloneRetryBaseDelay   time.Duration
	rcloneRetryMaxDelay    time.Duration
	rcloneRetryJitterRatio float64
	rcloneRetryRandFloat   func() float64

	// When enabled, persist unknown rclone stderr samples for later pattern expansion.
	captureUnknownRcloneErrors bool
}

type QueueStats struct {
	Depth    int
	Capacity int
}

type s3KeyPair struct {
	SrcKey string
	DstKey string
}

func NewManager(cfg Config) *Manager {
	wiring := resolveManagerWiring(cfg)

	m := &Manager{
		store:                      cfg.Store,
		dataDir:                    cfg.DataDir,
		hub:                        cfg.Hub,
		metrics:                    cfg.Metrics,
		logMaxBytes:                cfg.JobLogMaxBytes,
		logEmitStdout:              cfg.JobLogEmitStdout,
		jobRetention:               cfg.JobRetention,
		jobLogRetention:            cfg.JobLogRetention,
		queue:                      make([]string, 0, wiring.queueCapacity),
		queueCapacity:              wiring.queueCapacity,
		sem:                        make(chan struct{}, wiring.concurrency),
		cancels:                    make(map[string]context.CancelFunc),
		pids:                       make(map[string]int),
		uploadTTL:                  cfg.UploadSessionTTL,
		allowedLocalDirs:           wiring.allowedLocalDirs,
		logLineMaxBytes:            wiring.logLineMaxBytes,
		rcloneTuneEnabled:          wiring.rcloneTuneEnabled,
		rcloneMaxTransfers:         wiring.rcloneMaxTransfers,
		rcloneMaxCheckers:          wiring.rcloneMaxCheckers,
		rcloneS3ChunkSizeMiB:       wiring.rcloneS3ChunkSizeMiB,
		rcloneS3UploadConcurrency:  wiring.rcloneS3UploadConcurrency,
		rcloneLowLevelRetries:      wiring.rcloneLowLevelRetries,
		rcloneStatsInterval:        wiring.rcloneStatsInterval,
		rcloneRetryAttempts:        wiring.rcloneRetryAttempts,
		rcloneRetryBaseDelay:       wiring.rcloneRetryBaseDelay,
		rcloneRetryMaxDelay:        wiring.rcloneRetryMaxDelay,
		rcloneRetryJitterRatio:     wiring.rcloneRetryJitterRatio,
		rcloneRetryRandFloat:       wiring.rcloneRetryRandFloat,
		captureUnknownRcloneErrors: wiring.captureUnknownRcloneErrors,
	}
	m.queueCond = sync.NewCond(&m.queueMu)

	if m.metrics != nil {
		m.metrics.SetJobsQueueCapacity(wiring.queueCapacity)
		m.metrics.SetJobsQueueDepth(0)
	}

	return m
}

func (m *Manager) Run(ctx context.Context) {
	stopWake := context.AfterFunc(ctx, func() {
		m.queueMu.Lock()
		m.queueCond.Broadcast()
		m.queueMu.Unlock()
	})
	defer stopWake()

	for {
		jobID, ok := m.dequeue(ctx)
		if !ok {
			return
		}
		m.sem <- struct{}{}
		go func() {
			defer func() { <-m.sem }()
			if err := m.runJob(ctx, jobID); err != nil {
				logging.ErrorFields("job execution failed", map[string]any{
					"event":   "job.run_failed",
					"job_id":  jobID,
					"error":   err.Error(),
					"message": "job terminated before a consistent completion state was published",
				})
			}
		}()
	}
}

func (m *Manager) IsSupportedJobType(jobType string) bool {
	return isSupportedJobType(jobType)
}

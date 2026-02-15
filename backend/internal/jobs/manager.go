package jobs

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"s3desk/internal/logging"
	"s3desk/internal/metrics"
	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/rcloneerrors"
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
	logReadBufferSize       = 64 * 1024
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

	queue chan string
	sem   chan struct{}

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

	cpu := runtime.NumCPU()
	defaultMaxTransfers := cpu * 4
	if defaultMaxTransfers < 4 {
		defaultMaxTransfers = 4
	}
	if defaultMaxTransfers > 128 {
		defaultMaxTransfers = 128
	}

	defaultMaxCheckers := cpu * 8
	if defaultMaxCheckers < 8 {
		defaultMaxCheckers = 8
	}
	if defaultMaxCheckers > 256 {
		defaultMaxCheckers = 256
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
	retryJitterRatio := envFloat("RCLONE_RETRY_JITTER_RATIO", 0.2)
	if retryJitterRatio < 0 {
		retryJitterRatio = 0
	}
	if retryJitterRatio > 1 {
		retryJitterRatio = 1
	}
	captureUnknown := envBool("RCLONE_CAPTURE_UNKNOWN_ERRORS", false)

	m := &Manager{
		store:           cfg.Store,
		dataDir:         cfg.DataDir,
		hub:             cfg.Hub,
		metrics:         cfg.Metrics,
		logMaxBytes:     cfg.JobLogMaxBytes,
		logEmitStdout:   cfg.JobLogEmitStdout,
		jobRetention:    cfg.JobRetention,
		jobLogRetention: cfg.JobLogRetention,
		queue:           make(chan string, queueCapacity),
		sem:             make(chan struct{}, concurrency),
		cancels:         make(map[string]context.CancelFunc),
		pids:            make(map[string]int),
		uploadTTL:       cfg.UploadSessionTTL,
		allowedLocalDirs: func() []string {
			if len(cfg.AllowedLocalDirs) == 0 {
				return nil
			}
			out := make([]string, 0, len(cfg.AllowedLocalDirs))
			for _, d := range cfg.AllowedLocalDirs {
				d = filepath.Clean(d)
				if d == "" || d == "." {
					continue
				}
				out = append(out, d)
			}
			return out
		}(),

		logLineMaxBytes:            logLineMaxBytes,
		rcloneTuneEnabled:          envBool("RCLONE_TUNE", true),
		rcloneMaxTransfers:         envInt("RCLONE_MAX_TRANSFERS", defaultMaxTransfers),
		rcloneMaxCheckers:          envInt("RCLONE_MAX_CHECKERS", defaultMaxCheckers),
		rcloneS3ChunkSizeMiB:       envInt("RCLONE_S3_CHUNK_SIZE_MIB", 0),
		rcloneS3UploadConcurrency:  envInt("RCLONE_S3_UPLOAD_CONCURRENCY", 0),
		rcloneStatsInterval:        statsInterval,
		rcloneRetryAttempts:        retryAttempts,
		rcloneRetryBaseDelay:       retryBaseDelay,
		rcloneRetryMaxDelay:        retryMaxDelay,
		rcloneRetryJitterRatio:     retryJitterRatio,
		rcloneRetryRandFloat:       rand.Float64,
		captureUnknownRcloneErrors: captureUnknown,
	}

	if m.metrics != nil {
		m.metrics.SetJobsQueueCapacity(queueCapacity)
		m.metrics.SetJobsQueueDepth(0)
	}

	return m
}

func envInt(key string, defaultValue int) int {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func envFloat(key string, defaultValue float64) float64 {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func envBool(key string, defaultValue bool) bool {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue
	}
	switch strings.ToLower(val) {
	case "1", "true", "t", "yes", "y", "on":
		return true
	case "0", "false", "f", "no", "n", "off":
		return false
	default:
		return defaultValue
	}
}

func envDuration(key string, defaultValue time.Duration) time.Duration {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue
	}
	parsed, err := time.ParseDuration(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

type rcloneTune struct {
	Transfers         int
	Checkers          int
	UploadConcurrency int
	ActiveJobs        int
}

func hasAnyFlag(args []string, flags ...string) bool {
	for _, a := range args {
		for _, f := range flags {
			if a == f {
				return true
			}
		}
	}
	return false
}

func (m *Manager) computeRcloneTune(commandArgs []string, isS3 bool) (tune rcloneTune, ok bool) {
	if !m.rcloneTuneEnabled {
		return rcloneTune{}, false
	}
	if len(commandArgs) == 0 {
		return rcloneTune{}, false
	}

	switch commandArgs[0] {
	case "sync", "copy", "move", "copyto", "moveto", "delete", "purge":
		// supported
	default:
		return rcloneTune{}, false
	}

	activeJobs := len(m.sem)
	if activeJobs < 1 {
		activeJobs = 1
	}

	maxTransfers := m.rcloneMaxTransfers
	if maxTransfers <= 0 {
		maxTransfers = 4
	}
	maxCheckers := m.rcloneMaxCheckers
	if maxCheckers <= 0 {
		maxCheckers = 8
	}

	transfers := maxTransfers / activeJobs
	if transfers < 1 {
		transfers = 1
	}
	if transfers > maxTransfers {
		transfers = maxTransfers
	}

	checkers := maxCheckers / activeJobs
	if checkers < 1 {
		checkers = 1
	}
	if checkers > maxCheckers {
		checkers = maxCheckers
	}

	uploadConcurrency := 0
	if isS3 && m.rcloneS3UploadConcurrency > 0 {
		uploadConcurrency = m.rcloneS3UploadConcurrency / activeJobs
		if uploadConcurrency < 1 {
			uploadConcurrency = 1
		}
		if uploadConcurrency > m.rcloneS3UploadConcurrency {
			uploadConcurrency = m.rcloneS3UploadConcurrency
		}
	}

	return rcloneTune{
		Transfers:         transfers,
		Checkers:          checkers,
		UploadConcurrency: uploadConcurrency,
		ActiveJobs:        activeJobs,
	}, true
}

func applyRcloneTune(args []string, tune rcloneTune, isS3 bool) []string {
	if tune.Transfers > 0 && !hasAnyFlag(args, "--transfers") {
		args = append(args, "--transfers", strconv.Itoa(tune.Transfers))
	}
	if tune.Checkers > 0 && !hasAnyFlag(args, "--checkers") {
		args = append(args, "--checkers", strconv.Itoa(tune.Checkers))
	}
	if isS3 && tune.UploadConcurrency > 0 && !hasAnyFlag(args, "--s3-upload-concurrency") {
		args = append(args, "--s3-upload-concurrency", strconv.Itoa(tune.UploadConcurrency))
	}
	return args
}

func (m *Manager) RecoverAndRequeue(ctx context.Context) error {
	runningIDs, err := m.store.ListJobIDsByStatus(ctx, models.JobStatusRunning)
	if err != nil {
		return err
	}
	if len(runningIDs) > 0 {
		msg := "server restarted"
		code := ErrorCodeServerRestarted
		for _, id := range runningIDs {
			profileID, job, ok, err := m.store.GetJobByID(ctx, id)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
			if err := m.finalizeJob(id, models.JobStatusFailed, &finishedAt, &msg, &code); err != nil {
				return err
			}

			payload := map[string]any{"status": models.JobStatusFailed, "error": msg, "errorCode": code}
			if jp := m.loadJobProgress(id); jp != nil {
				payload["progress"] = jp
			}
			m.hub.Publish(ws.Event{Type: "job.completed", JobID: id, Payload: payload})
			if m.metrics != nil {
				m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusFailed), &code)
				if isTransferJobType(job.Type) {
					m.metrics.IncTransferErrors(code)
				}
			}

			logging.ErrorFields("job failed after restart", map[string]any{
				"event":      "job.completed",
				"job_id":     id,
				"job_type":   job.Type,
				"profile_id": profileID,
				"status":     models.JobStatusFailed,
				"error":      msg,
				"error_code": code,
			})
		}
	}
	queuedIDs, err := m.store.ListJobIDsByStatus(ctx, models.JobStatusQueued)
	if err != nil {
		return err
	}
	for i, id := range queuedIDs {
		if err := m.Enqueue(id); err != nil {
			if errors.Is(err, ErrJobQueueFull) {
				remaining := append([]string(nil), queuedIDs[i:]...)
				go m.enqueueBlocking(ctx, remaining)
				break
			}
			return err
		}
	}
	return nil
}

func (m *Manager) RunMaintenance(ctx context.Context) {
	m.cleanupExpiredUploadSessions(ctx)
	m.cleanupOrphanArtifacts(ctx)
	m.cleanupOldJobs(ctx)
	m.cleanupExpiredJobLogs(ctx)

	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.cleanupExpiredUploadSessions(ctx)
			m.cleanupOrphanArtifacts(ctx)
			m.cleanupOldJobs(ctx)
			m.cleanupExpiredJobLogs(ctx)
		}
	}
}

func (m *Manager) cleanupExpiredUploadSessions(ctx context.Context) {
	now := time.Now().UTC().Format(time.RFC3339Nano)

	for {
		sessions, err := m.store.ListExpiredUploadSessions(ctx, now, 200)
		if err != nil {
			return
		}
		if len(sessions) == 0 {
			return
		}
		for _, us := range sessions {
			_, _ = m.store.DeleteUploadSession(ctx, us.ProfileID, us.ID)
			if us.StagingDir != "" {
				_ = os.RemoveAll(us.StagingDir)
			}
		}
	}
}

func (m *Manager) cleanupOrphanArtifacts(ctx context.Context) {
	m.cleanupOrphanJobLogs(ctx)
	m.cleanupOrphanJobArtifacts(ctx)
	m.cleanupOrphanStagingDirs(ctx)
}

func (m *Manager) cleanupOldJobs(ctx context.Context) {
	if m.jobRetention <= 0 {
		return
	}

	cutoff := time.Now().Add(-m.jobRetention).UTC().Format(time.RFC3339Nano)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		ids, err := m.store.DeleteFinishedJobsBefore(callCtx, cutoff, 200)
		cancel()
		if err != nil || len(ids) == 0 {
			return
		}

		for _, id := range ids {
			_ = os.Remove(filepath.Join(m.dataDir, "logs", "jobs", id+".log"))
			_ = os.Remove(filepath.Join(m.dataDir, "logs", "jobs", id+".cmd"))
			_ = os.Remove(filepath.Join(m.dataDir, "artifacts", "jobs", id+".zip"))
			_ = os.Remove(filepath.Join(m.dataDir, "artifacts", "jobs", id+".zip.tmp"))
		}

		m.hub.Publish(ws.Event{Type: "jobs.deleted", Payload: map[string]any{"jobIds": ids, "reason": "retention"}})
	}
}

func (m *Manager) cleanupExpiredJobLogs(ctx context.Context) {
	if m.jobLogRetention <= 0 {
		return
	}

	logDir := filepath.Join(m.dataDir, "logs", "jobs")
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return
	}

	jobIDs := make(map[string]struct{}, len(entries))
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		if !(strings.HasSuffix(name, ".log") || strings.HasSuffix(name, ".cmd")) {
			continue
		}
		jobID := strings.TrimSuffix(name, filepath.Ext(name))
		if jobID == "" {
			continue
		}
		jobIDs[jobID] = struct{}{}
	}
	if len(jobIDs) == 0 {
		return
	}

	cutoff := time.Now().Add(-m.jobLogRetention)
	for jobID := range jobIDs {
		select {
		case <-ctx.Done():
			return
		default:
		}
		callCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		_, job, ok, err := m.store.GetJobByID(callCtx, jobID)
		cancel()
		if err != nil || !ok || job.FinishedAt == nil {
			continue
		}
		finishedAt, err := time.Parse(time.RFC3339Nano, *job.FinishedAt)
		if err != nil || finishedAt.After(cutoff) {
			continue
		}
		_ = os.Remove(filepath.Join(logDir, jobID+".log"))
		_ = os.Remove(filepath.Join(logDir, jobID+".cmd"))
	}
}

func (m *Manager) cleanupOrphanJobLogs(ctx context.Context) {
	logDir := filepath.Join(m.dataDir, "logs", "jobs")
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return
	}

	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		jobID := ""
		isRcloneConf := false
		switch {
		case strings.HasSuffix(name, ".log"):
			jobID = strings.TrimSuffix(name, ".log")
		case strings.HasSuffix(name, ".cmd"):
			jobID = strings.TrimSuffix(name, ".cmd")
		case strings.HasSuffix(name, ".rclone.conf"):
			jobID = strings.TrimSuffix(name, ".rclone.conf")
			isRcloneConf = true
		default:
			continue
		}
		if jobID == "" {
			continue
		}
		if isRcloneConf {
			_, job, ok, err := m.store.GetJobByID(ctx, jobID)
			if err == nil && ok && job.Status == models.JobStatusRunning {
				continue
			}
			_ = os.Remove(filepath.Join(logDir, name))
			continue
		}

		exists, err := m.store.JobExists(ctx, jobID)
		if err != nil || exists {
			continue
		}
		_ = os.Remove(filepath.Join(logDir, name))
	}
}

func (m *Manager) cleanupOrphanJobArtifacts(ctx context.Context) {
	artifactDir := filepath.Join(m.dataDir, "artifacts", "jobs")
	entries, err := os.ReadDir(artifactDir)
	if err != nil {
		return
	}

	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		if !(strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".zip.tmp")) {
			continue
		}

		base := strings.TrimSuffix(name, ".zip.tmp")
		base = strings.TrimSuffix(base, ".zip")
		jobID := strings.TrimSpace(base)
		if jobID == "" {
			continue
		}

		exists, err := m.store.JobExists(ctx, jobID)
		if err != nil || exists {
			continue
		}
		_ = os.Remove(filepath.Join(artifactDir, name))
	}
}

func (m *Manager) cleanupOrphanStagingDirs(ctx context.Context) {
	stagingDir := filepath.Join(m.dataDir, "staging")
	entries, err := os.ReadDir(stagingDir)
	if err != nil {
		return
	}

	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		uploadID := ent.Name()
		if uploadID == "" {
			continue
		}
		exists, err := m.store.UploadSessionExists(ctx, uploadID)
		if err != nil || exists {
			continue
		}
		_ = os.RemoveAll(filepath.Join(stagingDir, uploadID))
	}
}

func (m *Manager) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case jobID := <-m.queue:
			if m.metrics != nil {
				m.metrics.SetJobsQueueDepth(len(m.queue))
			}
			m.sem <- struct{}{}
			go func() {
				defer func() { <-m.sem }()
				_ = m.runJob(ctx, jobID)
			}()
		}
	}
}

func (m *Manager) QueueStats() QueueStats {
	return QueueStats{
		Depth:    len(m.queue),
		Capacity: cap(m.queue),
	}
}

func (m *Manager) Enqueue(jobID string) error {
	select {
	case m.queue <- jobID:
		if m.metrics != nil {
			m.metrics.SetJobsQueueDepth(len(m.queue))
		}
		return nil
	default:
		return ErrJobQueueFull
	}
}

func (m *Manager) enqueueBlocking(ctx context.Context, ids []string) {
	for _, id := range ids {
		select {
		case <-ctx.Done():
			return
		case m.queue <- id:
			if m.metrics != nil {
				m.metrics.SetJobsQueueDepth(len(m.queue))
			}
		}
	}
}

func (m *Manager) Cancel(jobID string) {
	m.mu.Lock()
	cancel, ok := m.cancels[jobID]
	pid := m.pids[jobID]
	m.mu.Unlock()

	if ok {
		if pid > 0 {
			_ = syscall.Kill(-pid, syscall.SIGKILL)
		}
		cancel()
	}
}

func (m *Manager) IsSupportedJobType(jobType string) bool {
	switch jobType {
	case JobTypeTransferSyncLocalToS3,
		JobTypeTransferSyncStagingToS3,
		JobTypeTransferSyncS3ToLocal,
		JobTypeTransferDeletePrefix,
		JobTypeTransferCopyObject,
		JobTypeTransferMoveObject,
		JobTypeTransferCopyBatch,
		JobTypeTransferMoveBatch,
		JobTypeTransferCopyPrefix,
		JobTypeTransferMovePrefix,
		JobTypeS3ZipPrefix,
		JobTypeS3ZipObjects,
		JobTypeS3DeleteObjects,
		JobTypeS3IndexObjects:
		return true
	default:
		return false
	}
}

func isTransferJobType(jobType string) bool {
	return strings.HasPrefix(jobType, "transfer_")
}

func transferDirectionForJobType(jobType string) string {
	switch jobType {
	case JobTypeTransferSyncLocalToS3, JobTypeTransferSyncStagingToS3:
		return "upload"
	case JobTypeTransferSyncS3ToLocal:
		return "download"
	default:
		return ""
	}
}

func (m *Manager) runJob(rootCtx context.Context, jobID string) error {
	profileID, job, ok, err := m.store.GetJobByID(rootCtx, jobID)
	if err != nil || !ok {
		return err
	}
	if job.Status != models.JobStatusQueued {
		return nil
	}

	profile, ok, err := m.store.GetProfile(rootCtx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrProfileNotFound
	}
	preserveLeadingSlash := profile.PreserveLeadingSlash

	start := time.Now()
	logging.InfoFields("job started", map[string]any{
		"event":      "job.started",
		"job_id":     jobID,
		"job_type":   job.Type,
		"profile_id": profileID,
	})
	if m.metrics != nil {
		m.metrics.IncJobsStarted(job.Type)
	}

	ctx, cancel := context.WithCancel(rootCtx)
	ctx = withJobType(ctx, job.Type)
	m.mu.Lock()
	m.cancels[jobID] = cancel
	m.mu.Unlock()
	defer func() {
		cancel()
		m.mu.Lock()
		delete(m.cancels, jobID)
		delete(m.pids, jobID)
		m.mu.Unlock()
	}()

	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := m.store.UpdateJobStatus(rootCtx, jobID, models.JobStatusRunning, &startedAt, nil, nil, nil, nil); err != nil {
		return err
	}
	m.hub.Publish(ws.Event{Type: "job.progress", JobID: jobID, Payload: map[string]any{"status": models.JobStatusRunning}})

	var runErr error
	switch job.Type {
	case JobTypeTransferSyncStagingToS3:
		runErr = m.runTransferSyncStagingToS3(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferSyncLocalToS3:
		runErr = m.runTransferSyncLocalToS3(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferSyncS3ToLocal:
		runErr = m.runTransferSyncS3ToLocal(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferDeletePrefix:
		runErr = m.runTransferDeletePrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferCopyObject:
		runErr = m.runTransferCopyObject(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferMoveObject:
		runErr = m.runTransferMoveObject(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferCopyBatch:
		runErr = m.runTransferCopyBatch(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferMoveBatch:
		runErr = m.runTransferMoveBatch(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferCopyPrefix:
		runErr = m.runTransferCopyPrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeTransferMovePrefix:
		runErr = m.runTransferMovePrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeS3ZipPrefix:
		runErr = m.runS3ZipPrefix(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeS3ZipObjects:
		runErr = m.runS3ZipObjects(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	case JobTypeS3DeleteObjects:
		runErr = m.runS3DeleteObjects(ctx, profileID, jobID, job.Payload)
	case JobTypeS3IndexObjects:
		runErr = m.runS3IndexObjects(ctx, profileID, jobID, job.Payload, preserveLeadingSlash)
	default:
		runErr = fmt.Errorf("unsupported job type: %s", job.Type)
	}

	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	duration := time.Since(start)
	if errors.Is(ctx.Err(), context.Canceled) {
		code := ErrorCodeCanceled
		_ = m.finalizeJob(jobID, models.JobStatusCanceled, &finishedAt, nil, &code)

		payload := map[string]any{"status": models.JobStatusCanceled, "errorCode": code}
		if jp := m.loadJobProgress(jobID); jp != nil {
			payload["progress"] = jp
			if m.metrics != nil {
				if dir := transferDirectionForJobType(job.Type); dir != "" && jp.BytesDone != nil && *jp.BytesDone > 0 {
					m.metrics.AddTransferBytes(dir, *jp.BytesDone)
				}
			}
		}
		m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
		if m.metrics != nil {
			m.metrics.IncJobsCanceled(job.Type)
			m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusCanceled), &code)
			m.metrics.ObserveJobsDuration(job.Type, string(models.JobStatusCanceled), &code, duration)
		}
		logging.InfoFields("job canceled", map[string]any{
			"event":       "job.completed",
			"job_id":      jobID,
			"job_type":    job.Type,
			"profile_id":  profileID,
			"status":      models.JobStatusCanceled,
			"error_code":  code,
			"duration_ms": duration.Milliseconds(),
		})
		return nil
	}
	if runErr != nil {
		msg := runErr.Error()
		code := ErrorCodeUnknown
		if c, ok := jobErrorCode(runErr); ok {
			code = c
		} else {
			// Best-effort mapping for non-rclone failures (e.g., missing transfer engine, deleted profile).
			switch {
			case errors.Is(runErr, ErrProfileNotFound):
				code = ErrorCodeNotFound
			case errors.Is(runErr, ErrRcloneNotFound):
				code = ErrorCodeTransferEngineMissing
			default:
				var inc *RcloneIncompatibleError
				if errors.As(runErr, &inc) {
					code = ErrorCodeTransferEngineIncompatible
				} else if errors.Is(runErr, context.Canceled) {
					code = ErrorCodeCanceled
				}
			}
		}
		_ = m.finalizeJob(jobID, models.JobStatusFailed, &finishedAt, &msg, &code)
		payload := map[string]any{"status": models.JobStatusFailed, "error": msg, "errorCode": code}
		if jp := m.loadJobProgress(jobID); jp != nil {
			payload["progress"] = jp
			if m.metrics != nil {
				if dir := transferDirectionForJobType(job.Type); dir != "" && jp.BytesDone != nil && *jp.BytesDone > 0 {
					m.metrics.AddTransferBytes(dir, *jp.BytesDone)
				}
			}
		}
		m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
		if m.metrics != nil {
			m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusFailed), &code)
			m.metrics.ObserveJobsDuration(job.Type, string(models.JobStatusFailed), &code, duration)
			if isTransferJobType(job.Type) {
				m.metrics.IncTransferErrors(code)
			}
		}
		logging.ErrorFields("job failed", map[string]any{
			"event":       "job.completed",
			"job_id":      jobID,
			"job_type":    job.Type,
			"profile_id":  profileID,
			"status":      models.JobStatusFailed,
			"error":       msg,
			"error_code":  code,
			"duration_ms": duration.Milliseconds(),
		})
		return runErr
	}

	_ = m.finalizeJob(jobID, models.JobStatusSucceeded, &finishedAt, nil, nil)
	payload := map[string]any{"status": models.JobStatusSucceeded}
	if jp := m.loadJobProgress(jobID); jp != nil {
		payload["progress"] = jp
		if m.metrics != nil {
			if dir := transferDirectionForJobType(job.Type); dir != "" && jp.BytesDone != nil && *jp.BytesDone > 0 {
				m.metrics.AddTransferBytes(dir, *jp.BytesDone)
			}
		}
	}
	m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
	if m.metrics != nil {
		m.metrics.IncJobsCompleted(job.Type, string(models.JobStatusSucceeded), nil)
		m.metrics.ObserveJobsDuration(job.Type, string(models.JobStatusSucceeded), nil, duration)
	}
	logging.InfoFields("job completed", map[string]any{
		"event":       "job.completed",
		"job_id":      jobID,
		"job_type":    job.Type,
		"profile_id":  profileID,
		"status":      models.JobStatusSucceeded,
		"duration_ms": duration.Milliseconds(),
	})
	return nil
}

func (m *Manager) loadJobProgress(jobID string) *models.JobProgress {
	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_, job, ok, err := m.store.GetJobByID(updateCtx, jobID)
	cancel()
	if err != nil || !ok {
		return nil
	}
	return job.Progress
}

func (m *Manager) finalizeJob(jobID string, status models.JobStatus, finishedAt *string, errMsg *string, errorCode *string) error {
	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_, job, ok, err := m.store.GetJobByID(updateCtx, jobID)
	cancel()

	var jp *models.JobProgress
	if err == nil && ok && job.Progress != nil {
		copied := *job.Progress
		copied.ObjectsPerSecond = nil
		copied.SpeedBps = nil
		copied.EtaSeconds = nil
		jp = &copied
	}

	updateCtx, cancel = context.WithTimeout(context.Background(), 2*time.Second)
	err = m.store.UpdateJobStatus(updateCtx, jobID, status, nil, finishedAt, jp, errMsg, errorCode)
	cancel()
	return err
}

func (m *Manager) runTransferSyncStagingToS3(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferSyncStagingToS3Payload(payload)
	if err != nil {
		return err
	}
	uploadID := parsed.UploadID
	if uploadID == "" {
		return errors.New("payload.uploadId is required")
	}

	us, ok, err := m.store.GetUploadSession(ctx, profileID, uploadID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("upload session not found")
	}

	// best-effort expiry check
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil {
		if time.Now().UTC().After(expiresAt) {
			return errors.New("upload session expired")
		}
	}

	// Sync staging dir -> bucket/prefix
	src := filepath.Clean(us.StagingDir)
	dst := rcloneRemoteDir(us.Bucket, us.Prefix, preserveLeadingSlash)

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	if totals, err := computeLocalTotals(preflightCtx, src, nil, nil); err == nil {
		m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
	}
	cancel()
	err = m.runRcloneSync(ctx, profileID, jobID, src, dst, false, nil, nil, false, rcloneProgressTransfers)
	if err != nil {
		return err
	}

	// Cleanup staging on success (best-effort).
	_, _ = m.store.DeleteUploadSession(context.Background(), profileID, uploadID)
	_ = os.RemoveAll(src)
	return nil
}

func (m *Manager) runTransferSyncLocalToS3(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferSyncLocalPathPayload(payload)
	if err != nil {
		return err
	}
	bucket := parsed.Bucket
	prefix := parsed.Prefix
	localPath := parsed.LocalPath
	if bucket == "" || localPath == "" {
		return errors.New("payload.bucket and payload.localPath are required")
	}

	dryRun := parsed.DryRun
	deleteExtraneous := parsed.DeleteExtraneous
	include := parsed.Include
	exclude := parsed.Exclude

	src := filepath.Clean(localPath)
	if err := m.ensureLocalPathAllowed(src); err != nil {
		return err
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	if totals, err := computeLocalTotals(preflightCtx, src, include, exclude); err == nil {
		m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
	}
	cancel()
	dst := rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)
	return m.runRcloneSync(ctx, profileID, jobID, src, dst, deleteExtraneous, include, exclude, dryRun, rcloneProgressTransfers)
}

func (m *Manager) runTransferSyncS3ToLocal(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferSyncLocalPathPayload(payload)
	if err != nil {
		return err
	}
	bucket := parsed.Bucket
	prefix := parsed.Prefix
	localPath := parsed.LocalPath
	if bucket == "" || localPath == "" {
		return errors.New("payload.bucket and payload.localPath are required")
	}

	dryRun := parsed.DryRun
	deleteExtraneous := parsed.DeleteExtraneous
	include := parsed.Include
	exclude := parsed.Exclude

	bucket = strings.TrimSpace(bucket)
	prefix = normalizeKeyInput(prefix, preserveLeadingSlash)
	localPath = strings.TrimSpace(localPath)

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if localPath == "" {
		return errors.New("payload.localPath is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}

	dst, err := m.prepareLocalDestination(localPath)
	if err != nil {
		return err
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, bucket, prefix, include, exclude, preserveLeadingSlash)
	cancel()

	src := rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)
	return m.runRcloneSync(ctx, profileID, jobID, src, dst, deleteExtraneous, include, exclude, dryRun, rcloneProgressTransfers)
}

func (m *Manager) runTransferDeletePrefix(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferDeletePrefixPayload(payload)
	if err != nil {
		return err
	}
	bucket := parsed.Bucket
	prefix := parsed.Prefix
	deleteAll := parsed.DeleteAll
	dryRun := parsed.DryRun
	allowUnsafePrefix := parsed.AllowUnsafePrefix
	include := parsed.Include
	exclude := parsed.Exclude

	bucket = strings.TrimSpace(bucket)
	prefix = normalizeKeyInput(prefix, preserveLeadingSlash)

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if deleteAll && prefix != "" {
		return errors.New("payload.prefix must be empty when payload.deleteAll=true")
	}
	if prefix == "" && !deleteAll {
		return errors.New("payload.prefix is required (or set payload.deleteAll=true)")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}
	if prefix != "" && !strings.HasSuffix(prefix, "/") && !allowUnsafePrefix {
		return errors.New("payload.prefix must end with '/' (or set payload.allowUnsafePrefix=true)")
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobObjectsTotalFromS3Prefix(preflightCtx, profileID, jobID, bucket, prefix, include, exclude, preserveLeadingSlash)
	cancel()

	cmd := "delete"
	target := rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)
	if deleteAll {
		cmd = "purge"
		target = rcloneRemoteBucket(bucket)
	}

	args := []string{cmd}
	if !deleteAll {
		for _, pat := range include {
			if pat == "" {
				continue
			}
			args = append(args, "--include", pat)
		}
		for _, pat := range exclude {
			if pat == "" {
				continue
			}
			args = append(args, "--exclude", pat)
		}
	}
	args = append(args, target)

	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressDeletes})
}

func (m *Manager) runTransferCopyObject(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMoveObjectPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcKey := parsed.SrcKey
	dstBucket := parsed.DstBucket
	dstKey := parsed.DstKey
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = normalizeKeyInput(srcKey, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = normalizeKeyInput(dstKey, preserveLeadingSlash)

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	m.trySetJobTotalsFromS3Object(ctx, profileID, jobID, srcBucket, srcKey, preserveLeadingSlash)

	args := []string{"copyto", rcloneRemoteObject(srcBucket, srcKey, preserveLeadingSlash), rcloneRemoteObject(dstBucket, dstKey, preserveLeadingSlash)}
	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) runTransferMoveObject(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMoveObjectPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcKey := parsed.SrcKey
	dstBucket := parsed.DstBucket
	dstKey := parsed.DstKey
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = normalizeKeyInput(srcKey, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = normalizeKeyInput(dstKey, preserveLeadingSlash)

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	m.trySetJobTotalsFromS3Object(ctx, profileID, jobID, srcBucket, srcKey, preserveLeadingSlash)

	args := []string{"moveto", rcloneRemoteObject(srcBucket, srcKey, preserveLeadingSlash), rcloneRemoteObject(dstBucket, dstKey, preserveLeadingSlash)}
	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) runTransferCopyBatch(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferBatchPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	dstBucket := parsed.DstBucket
	items := parsed.Items
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)
	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if len(items) < 1 {
		return errors.New("payload.items is required")
	}

	pairs := make([]s3KeyPair, 0, len(items))
	for i, item := range items {
		srcKey := normalizeKeyInput(item.SrcKey, preserveLeadingSlash)
		dstKey := normalizeKeyInput(item.DstKey, preserveLeadingSlash)
		if srcKey == "" || dstKey == "" {
			return fmt.Errorf("payload.items[%d].srcKey and payload.items[%d].dstKey are required", i, i)
		}
		if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
			return fmt.Errorf("wildcards are not allowed in keys (items[%d])", i)
		}
		if srcBucket == dstBucket && srcKey == dstKey {
			return fmt.Errorf("source and destination must be different (items[%d])", i)
		}
		pairs = append(pairs, s3KeyPair{SrcKey: srcKey, DstKey: dstKey})
	}
	if len(pairs) == 0 {
		return errors.New("payload.items must contain at least one item")
	}

	m.trySetJobObjectsTotal(jobID, int64(len(pairs)))

	return m.runTransferBatch(ctx, profileID, jobID, srcBucket, dstBucket, pairs, "copyto", dryRun, preserveLeadingSlash)
}

func (m *Manager) runTransferMoveBatch(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferBatchPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	dstBucket := parsed.DstBucket
	items := parsed.Items
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)
	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if len(items) < 1 {
		return errors.New("payload.items is required")
	}

	pairs := make([]s3KeyPair, 0, len(items))
	for i, item := range items {
		srcKey := normalizeKeyInput(item.SrcKey, preserveLeadingSlash)
		dstKey := normalizeKeyInput(item.DstKey, preserveLeadingSlash)
		if srcKey == "" || dstKey == "" {
			return fmt.Errorf("payload.items[%d].srcKey and payload.items[%d].dstKey are required", i, i)
		}
		if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
			return fmt.Errorf("wildcards are not allowed in keys (items[%d])", i)
		}
		if srcBucket == dstBucket && srcKey == dstKey {
			return fmt.Errorf("source and destination must be different (items[%d])", i)
		}
		pairs = append(pairs, s3KeyPair{SrcKey: srcKey, DstKey: dstKey})
	}
	if len(pairs) == 0 {
		return errors.New("payload.items must contain at least one item")
	}

	m.trySetJobObjectsTotal(jobID, int64(len(pairs)))

	return m.runTransferBatch(ctx, profileID, jobID, srcBucket, dstBucket, pairs, "moveto", dryRun, preserveLeadingSlash)
}

func (m *Manager) runTransferBatch(ctx context.Context, profileID, jobID, srcBucket, dstBucket string, pairs []s3KeyPair, op string, dryRun bool, preserveLeadingSlash bool) error {
	for _, pair := range pairs {
		if pair.SrcKey == "" || pair.DstKey == "" {
			continue
		}
		args := []string{
			op,
			rcloneRemoteObject(srcBucket, pair.SrcKey, preserveLeadingSlash),
			rcloneRemoteObject(dstBucket, pair.DstKey, preserveLeadingSlash),
		}
		if err := m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: false, DryRun: dryRun, ProgressMode: rcloneProgressTransfers}); err != nil {
			return err
		}
		m.incrementJobObjectsDone(jobID, 1)
	}
	return nil
}

func (m *Manager) trySetJobTotals(jobID string, objectsTotal, bytesTotal int64) {
	ot := objectsTotal
	bt := bytesTotal
	jp := &models.JobProgress{ObjectsTotal: &ot, BytesTotal: &bt}

	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil, nil)
	cancel()

	m.hub.Publish(ws.Event{
		Type:  "job.progress",
		JobID: jobID,
		Payload: map[string]any{
			"status":   models.JobStatusRunning,
			"progress": jp,
		},
	})
}

func (m *Manager) trySetJobObjectsTotal(jobID string, objectsTotal int64) {
	ot := objectsTotal
	jp := &models.JobProgress{ObjectsTotal: &ot}

	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil, nil)
	cancel()

	m.hub.Publish(ws.Event{
		Type:  "job.progress",
		JobID: jobID,
		Payload: map[string]any{
			"status":   models.JobStatusRunning,
			"progress": jp,
		},
	})
}

func (m *Manager) incrementJobObjectsDone(jobID string, delta int64) {
	if delta <= 0 {
		return
	}

	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_, job, ok, err := m.store.GetJobByID(updateCtx, jobID)
	cancel()
	if err != nil || !ok {
		return
	}

	var jp models.JobProgress
	if job.Progress != nil {
		jp = *job.Progress
	}

	done := delta
	if jp.ObjectsDone != nil {
		done += *jp.ObjectsDone
	}
	jp.ObjectsDone = &done

	updateCtx, cancel = context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, &jp, nil, nil)
	cancel()

	m.hub.Publish(ws.Event{
		Type:  "job.progress",
		JobID: jobID,
		Payload: map[string]any{
			"status":   models.JobStatusRunning,
			"progress": &jp,
		},
	})
}

func (m *Manager) trySetJobTotalsFromS3Object(ctx context.Context, profileID, jobID, bucket, key string, preserveLeadingSlash bool) {
	key = normalizeKeyInput(key, preserveLeadingSlash)

	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return
	}

	headCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	proc, err := m.startRcloneCommand(headCtx, profileSecrets, jobID, []string{"lsjson", "--stat", "--no-mimetype", rcloneRemoteObject(bucket, key, preserveLeadingSlash)})
	if err != nil {
		return
	}
	out, readErr := io.ReadAll(proc.stdout)
	waitErr := proc.wait()
	if readErr != nil || waitErr != nil {
		return
	}
	if len(out) == 0 {
		return
	}

	var entry rcloneListEntry
	if err := json.Unmarshal(out, &entry); err != nil {
		return
	}

	ot := int64(1)
	jp := &models.JobProgress{ObjectsTotal: &ot}
	if entry.Size > 0 {
		bt := entry.Size
		jp.BytesTotal = &bt
	}

	updateCtx, cancel2 := context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil, nil)
	cancel2()

	m.hub.Publish(ws.Event{
		Type:  "job.progress",
		JobID: jobID,
		Payload: map[string]any{
			"status":   models.JobStatusRunning,
			"progress": jp,
		},
	})
}

func (m *Manager) trySetJobTotalsFromS3Prefix(ctx context.Context, profileID, jobID, bucket, prefix string, include, exclude []string, preserveLeadingSlash bool) {
	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return
	}

	totals, ok, err := computeS3PrefixTotals(ctx, m, profileSecrets, jobID, bucket, prefix, include, exclude, 0, preserveLeadingSlash)
	if err != nil || !ok {
		return
	}

	m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
}

func (m *Manager) trySetJobObjectsTotalFromS3Prefix(ctx context.Context, profileID, jobID, bucket, prefix string, include, exclude []string, preserveLeadingSlash bool) {
	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return
	}

	totals, ok, err := computeS3PrefixTotals(ctx, m, profileSecrets, jobID, bucket, prefix, include, exclude, 0, preserveLeadingSlash)
	if err != nil || !ok {
		return
	}

	m.trySetJobObjectsTotal(jobID, totals.Objects)
}

func (m *Manager) runTransferCopyPrefix(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMovePrefixPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcPrefix := parsed.SrcPrefix
	dstBucket := parsed.DstBucket
	dstPrefix := parsed.DstPrefix
	dryRun := parsed.DryRun
	include := parsed.Include
	exclude := parsed.Exclude

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = normalizeKeyInput(srcPrefix, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = normalizeKeyInput(dstPrefix, preserveLeadingSlash)

	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if srcPrefix == "" {
		return errors.New("payload.srcPrefix is required")
	}
	if strings.Contains(srcPrefix, "*") || strings.Contains(dstPrefix, "*") {
		return errors.New("wildcards are not allowed in prefixes")
	}
	if !strings.HasSuffix(srcPrefix, "/") {
		return errors.New("payload.srcPrefix must end with '/'")
	}
	if dstPrefix != "" && !strings.HasSuffix(dstPrefix, "/") {
		dstPrefix += "/"
	}
	if srcBucket == dstBucket {
		if dstPrefix == "" {
			// ok
		} else {
			if dstPrefix == srcPrefix {
				return errors.New("source and destination must be different")
			}
			if strings.HasPrefix(dstPrefix, srcPrefix) {
				return errors.New("destination prefix must not be under source prefix")
			}
		}
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, srcBucket, srcPrefix, include, exclude, preserveLeadingSlash)
	cancel()

	src := rcloneRemoteDir(srcBucket, srcPrefix, preserveLeadingSlash)
	dst := rcloneRemoteDir(dstBucket, dstPrefix, preserveLeadingSlash)

	args := []string{"copy"}
	for _, pat := range include {
		if pat == "" {
			continue
		}
		args = append(args, "--include", pat)
	}
	for _, pat := range exclude {
		if pat == "" {
			continue
		}
		args = append(args, "--exclude", pat)
	}
	args = append(args, src, dst)

	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) runTransferMovePrefix(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMovePrefixPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcPrefix := parsed.SrcPrefix
	dstBucket := parsed.DstBucket
	dstPrefix := parsed.DstPrefix
	dryRun := parsed.DryRun
	include := parsed.Include
	exclude := parsed.Exclude

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = normalizeKeyInput(srcPrefix, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = normalizeKeyInput(dstPrefix, preserveLeadingSlash)

	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if srcPrefix == "" {
		return errors.New("payload.srcPrefix is required")
	}
	if strings.Contains(srcPrefix, "*") || strings.Contains(dstPrefix, "*") {
		return errors.New("wildcards are not allowed in prefixes")
	}
	if !strings.HasSuffix(srcPrefix, "/") {
		return errors.New("payload.srcPrefix must end with '/'")
	}
	if dstPrefix != "" && !strings.HasSuffix(dstPrefix, "/") {
		dstPrefix += "/"
	}
	if srcBucket == dstBucket {
		if dstPrefix == "" {
			// ok
		} else {
			if dstPrefix == srcPrefix {
				return errors.New("source and destination must be different")
			}
			if strings.HasPrefix(dstPrefix, srcPrefix) {
				return errors.New("destination prefix must not be under source prefix")
			}
		}
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, srcBucket, srcPrefix, include, exclude, preserveLeadingSlash)
	cancel()

	src := rcloneRemoteDir(srcBucket, srcPrefix, preserveLeadingSlash)
	dst := rcloneRemoteDir(dstBucket, dstPrefix, preserveLeadingSlash)

	args := []string{"move"}
	for _, pat := range include {
		if pat == "" {
			continue
		}
		args = append(args, "--include", pat)
	}
	for _, pat := range exclude {
		if pat == "" {
			continue
		}
		args = append(args, "--exclude", pat)
	}
	args = append(args, src, dst)

	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) ensureLocalPathAllowed(localPath string) error {
	if len(m.allowedLocalDirs) == 0 {
		return nil
	}

	abs, err := filepath.Abs(localPath)
	if err != nil {
		return fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return fmt.Errorf("localPath %q not found: %w", localPath, err)
	}

	for _, dir := range m.allowedLocalDirs {
		if isUnderDir(dir, real) {
			return nil
		}
	}

	return fmt.Errorf("localPath %q is not allowed; must be under one of: %s", real, strings.Join(m.allowedLocalDirs, ", "))
}

func (m *Manager) prepareLocalDestination(localPath string) (string, error) {
	clean := filepath.Clean(localPath)
	if clean == "" || clean == "." {
		return "", fmt.Errorf("invalid localPath %q", localPath)
	}
	abs, err := filepath.Abs(clean)
	if err != nil {
		return "", fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}

	if err := m.ensureLocalPathAllowedForCreate(abs); err != nil {
		return "", err
	}

	if info, err := os.Stat(abs); err == nil {
		if !info.IsDir() {
			return "", fmt.Errorf("localPath %q must be a directory", abs)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("invalid localPath %q: %w", abs, err)
	} else {
		if err := os.MkdirAll(abs, 0o700); err != nil {
			return "", fmt.Errorf("failed to create localPath %q: %w", abs, err)
		}
	}

	// Normalize to a directory target for transfer operations.
	if !strings.HasSuffix(abs, string(os.PathSeparator)) {
		abs += string(os.PathSeparator)
	}
	return abs, nil
}

func (m *Manager) ensureLocalPathAllowedForCreate(localPath string) error {
	if len(m.allowedLocalDirs) == 0 {
		return nil
	}

	abs, err := filepath.Abs(localPath)
	if err != nil {
		return fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}

	real, err := evalSymlinksBestEffort(abs)
	if err != nil {
		return fmt.Errorf("invalid localPath %q: %w", localPath, err)
	}

	for _, dir := range m.allowedLocalDirs {
		if isUnderDir(dir, real) {
			return nil
		}
	}
	return fmt.Errorf("localPath %q is not allowed; must be under one of: %s", real, strings.Join(m.allowedLocalDirs, ", "))
}

func isUnderDir(dir, path string) bool {
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return false
	}
	return true
}

func evalSymlinksBestEffort(path string) (string, error) {
	clean := filepath.Clean(path)
	if clean == "" || clean == "." {
		return "", errors.New("invalid path")
	}

	p := clean
	var missing []string
	for {
		info, err := os.Stat(p)
		if err == nil {
			if !info.IsDir() && len(missing) > 0 {
				return "", fmt.Errorf("parent is not a directory: %q", p)
			}
			real, err := filepath.EvalSymlinks(p)
			if err != nil {
				return "", err
			}
			for i := len(missing) - 1; i >= 0; i-- {
				real = filepath.Join(real, missing[i])
			}
			return real, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}

		parent := filepath.Dir(p)
		if parent == p {
			real, err := filepath.EvalSymlinks(p)
			if err != nil {
				return "", err
			}
			for i := len(missing) - 1; i >= 0; i-- {
				real = filepath.Join(real, missing[i])
			}
			return real, nil
		}

		missing = append(missing, filepath.Base(p))
		p = parent
	}
}

func normalizeKeyInput(value string, preserveLeadingSlash bool) string {
	return rcloneconfig.NormalizePathInput(value, preserveLeadingSlash)
}

func rcloneRemoteBucket(bucket string) string {
	return rcloneconfig.RemoteBucket(bucket)
}

func rcloneRemoteDir(bucket, prefix string, preserveLeadingSlash bool) string {
	return rcloneconfig.RemoteDir(bucket, prefix, preserveLeadingSlash)
}

func rcloneRemoteObject(bucket, key string, preserveLeadingSlash bool) string {
	return rcloneconfig.RemoteObject(bucket, key, preserveLeadingSlash)
}

func (m *Manager) runRcloneSync(ctx context.Context, profileID, jobID, src, dst string, deleteExtraneous bool, include, exclude []string, dryRun bool, mode rcloneProgressMode) error {
	cmd := "copy"
	if deleteExtraneous {
		cmd = "sync"
	}
	args := []string{cmd}
	for _, pat := range include {
		if pat == "" {
			continue
		}
		args = append(args, "--include", pat)
	}
	for _, pat := range exclude {
		if pat == "" {
			continue
		}
		args = append(args, "--exclude", pat)
	}

	args = append(args, src, dst)
	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: mode})
}

type runRcloneOptions struct {
	TrackProgress bool
	DryRun        bool
	ProgressMode  rcloneProgressMode
}

type rcloneStatsUpdate struct {
	BytesDone    int64
	BytesTotal   *int64
	ObjectsDone  int64
	ObjectsTotal *int64
	SpeedBps     *int64
	EtaSeconds   *int
}

type rcloneProgressMode int

const (
	rcloneProgressTransfers rcloneProgressMode = iota
	rcloneProgressDeletes
)

func (m *Manager) runRclone(ctx context.Context, profileID, jobID string, commandArgs []string, opts runRcloneOptions) error {
	rclonePath, _, err := EnsureRcloneCompatible(ctx)
	if err != nil {
		return TransferEngineJobError(err)
	}

	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrProfileNotFound
	}

	configPath, err := m.writeRcloneConfig(jobID, profileSecrets)
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(configPath) }()

	tlsArgs, tlsCleanup, err := PrepareRcloneTLSFlags(profileSecrets)
	if err != nil {
		return err
	}
	defer tlsCleanup()

	statsInterval := m.rcloneStatsInterval
	if !opts.TrackProgress {
		statsInterval = 0
	}

	args := []string{
		"--config", configPath,
		"--stats", statsInterval.String(),
		"--stats-log-level", "NOTICE",
		"--use-json-log",
	}
	if len(tlsArgs) > 0 {
		args = append(args, tlsArgs...)
	}
	if opts.DryRun {
		args = append(args, "--dry-run")
	}
	isS3 := rcloneconfig.IsS3LikeProvider(profileSecrets.Provider)
	if isS3 && m.rcloneS3ChunkSizeMiB > 0 && !hasAnyFlag(args, "--s3-chunk-size") {
		args = append(args, "--s3-chunk-size", fmt.Sprintf("%dM", m.rcloneS3ChunkSizeMiB))
	}

	tune, tuneOK := m.computeRcloneTune(commandArgs, isS3)
	if tuneOK {
		args = applyRcloneTune(args, tune, isS3)
	}
	args = append(args, commandArgs...)

	logPath := filepath.Join(m.dataDir, "logs", "jobs", jobID+".log")
	logWriter, err := openJobLogWriter(logPath, m.logMaxBytes)
	if err != nil {
		return err
	}
	defer func() { _ = logWriter.Close() }()

	if tuneOK {
		tuneMsg := fmt.Sprintf("rclone tune: activeJobs=%d transfers=%d checkers=%d uploadConcurrency=%d", tune.ActiveJobs, tune.Transfers, tune.Checkers, tune.UploadConcurrency)
		_, _ = logWriter.Write([]byte("[info] " + tuneMsg + "\n"))
		m.emitJobLogStdout(jobID, "info", tuneMsg)
	}

	maxAttempts := m.rcloneRetryAttempts
	if maxAttempts < 1 {
		maxAttempts = 1
	}

	errContext := "rclone"
	if len(commandArgs) > 0 {
		errContext = errContext + " " + commandArgs[0]
	}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if attempt > 1 {
			m.writeJobLog(logWriter, jobID, "warn", fmt.Sprintf("retrying %s (attempt %d/%d)", errContext, attempt, maxAttempts))
		}

		stderrCapture, waitErr := m.runRcloneAttempt(ctx, rclonePath, args, jobID, logWriter, opts)
		if waitErr == nil {
			return nil
		}

		cls := rcloneerrors.Classify(waitErr, stderrCapture)
		if cls.Code == rcloneerrors.CodeUnknown {
			m.maybeCaptureUnknownRcloneError(profileSecrets, jobID, errContext, stderrCapture)
		}

		if attempt >= maxAttempts || !cls.Retryable {
			return jobErrorFromRclone(waitErr, stderrCapture, errContext)
		}

		if m.metrics != nil {
			if jt, ok := jobTypeFromContext(ctx); ok {
				m.metrics.IncJobsRetried(jt)
			}
		}

		delay := m.rcloneRetryDelay(attempt, cls.Code)
		m.writeJobLog(logWriter, jobID, "warn", fmt.Sprintf("%s failed with %s; retrying in %s (attempt %d/%d)", errContext, cls.Code, delay, attempt+1, maxAttempts))
		if err := sleepWithContext(ctx, delay); err != nil {
			return err
		}
	}
	return nil
}

func (m *Manager) writeRcloneConfig(jobID string, profile models.ProfileSecrets) (string, error) {
	dir := filepath.Join(m.dataDir, "logs", "jobs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	path := filepath.Join(dir, jobID+".rclone.conf")
	if err := rcloneconfig.WriteConfigFile(path, profile, rcloneconfig.RemoteName); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func (m *Manager) trackRcloneProgress(ctx context.Context, jobID string, progress <-chan rcloneStatsUpdate) {
	var (
		objectsTotal *int64
		bytesTotal   *int64
	)

	loadTotals := func() {
		updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, job, ok, err := m.store.GetJobByID(updateCtx, jobID)
		cancel()
		if err != nil || !ok || job.Progress == nil {
			return
		}
		if job.Progress.ObjectsTotal != nil {
			objectsTotal = job.Progress.ObjectsTotal
		}
		if job.Progress.BytesTotal != nil {
			bytesTotal = job.Progress.BytesTotal
		}
	}
	loadTotals()

	for {
		select {
		case <-ctx.Done():
			return
		case update, ok := <-progress:
			if !ok {
				return
			}

			if update.ObjectsTotal != nil && *update.ObjectsTotal > 0 {
				objectsTotal = update.ObjectsTotal
			}
			if update.BytesTotal != nil && *update.BytesTotal > 0 {
				bytesTotal = update.BytesTotal
			}

			od := update.ObjectsDone
			bd := update.BytesDone
			if objectsTotal == nil || bytesTotal == nil {
				loadTotals()
			}

			jp := &models.JobProgress{
				ObjectsDone:  &od,
				BytesDone:    &bd,
				ObjectsTotal: objectsTotal,
				BytesTotal:   bytesTotal,
			}
			if update.SpeedBps != nil {
				jp.SpeedBps = update.SpeedBps
			}
			if update.EtaSeconds != nil {
				jp.EtaSeconds = update.EtaSeconds
			}

			updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil, nil)
			cancel()

			m.hub.Publish(ws.Event{
				Type:  "job.progress",
				JobID: jobID,
				Payload: map[string]any{
					"status":   models.JobStatusRunning,
					"progress": jp,
				},
			})
		}
	}
}

func readLogLine(r *bufio.Reader, maxBytes int) (string, bool, error) {
	var out strings.Builder
	if maxBytes > 0 {
		if maxBytes < logReadBufferSize {
			out.Grow(maxBytes)
		} else {
			out.Grow(logReadBufferSize)
		}
	}

	truncated := false
	for {
		chunk, err := r.ReadString('\n')
		if len(chunk) > 0 {
			if maxBytes <= 0 {
				out.WriteString(chunk)
			} else {
				remaining := maxBytes - out.Len()
				switch {
				case remaining <= 0:
					truncated = true
				case len(chunk) <= remaining:
					out.WriteString(chunk)
				default:
					out.WriteString(chunk[:remaining])
					truncated = true
				}
			}
		}

		if err != nil {
			if errors.Is(err, bufio.ErrBufferFull) {
				truncated = true
				continue
			}
			if errors.Is(err, io.EOF) {
				if out.Len() == 0 {
					return "", truncated, io.EOF
				}
				break
			}
			return strings.TrimRight(out.String(), "\r\n"), truncated, err
		}
		break
	}

	line := strings.TrimRight(out.String(), "\r\n")
	if truncated {
		return line, true, bufio.ErrTooLong
	}
	return line, false, nil
}

func (m *Manager) pipeLogs(ctx context.Context, r io.Reader, w io.Writer, jobID, level string, capture *logCapture, progressCh chan<- rcloneStatsUpdate, mode rcloneProgressMode, maxLineBytes int) {
	reader := bufio.NewReaderSize(r, logReadBufferSize)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line, truncated, err := readLogLine(reader, maxLineBytes)
		if err != nil && !errors.Is(err, bufio.ErrTooLong) && !errors.Is(err, io.EOF) {
			return
		}
		if line == "" {
			if errors.Is(err, io.EOF) {
				return
			}
			continue
		}
		if truncated {
			line = line + " [truncated]"
		}

		rendered, stats := formatRcloneJSONLine(line)
		if rendered == "" {
			rendered = line
		}
		if capture != nil {
			capture.Add(rendered)
		}

		_, _ = w.Write([]byte("[" + level + "] " + rendered + "\n"))
		if progressCh != nil && stats != nil {
			if update, ok := progressFromStats(stats, mode); ok {
				select {
				case progressCh <- update:
				default:
				}
			}
		}
		m.hub.Publish(ws.Event{
			Type:  "job.log",
			JobID: jobID,
			Payload: map[string]any{
				"level":   level,
				"message": rendered,
			},
		})
		m.emitJobLogStdout(jobID, level, rendered)

		if errors.Is(err, io.EOF) {
			return
		}
	}
}

type rcloneLogLine struct {
	Msg    string       `json:"msg"`
	Object string       `json:"object"`
	Size   *int64       `json:"size"`
	Stats  *rcloneStats `json:"stats"`
}

type rcloneStats struct {
	Bytes          int64    `json:"bytes"`
	TotalBytes     int64    `json:"totalBytes"`
	Transfers      int64    `json:"transfers"`
	TotalTransfers int64    `json:"totalTransfers"`
	Speed          float64  `json:"speed"`
	Eta            *float64 `json:"eta"`
	Deletes        int64    `json:"deletes"`
}

func formatRcloneJSONLine(line string) (rendered string, stats *rcloneStats) {
	var msg rcloneLogLine
	if err := json.Unmarshal([]byte(line), &msg); err != nil {
		return "", nil
	}

	rendered = strings.TrimSpace(msg.Msg)
	if msg.Object != "" {
		if rendered == "" {
			rendered = msg.Object
		} else if !strings.Contains(rendered, msg.Object) {
			rendered = fmt.Sprintf("%s %s", rendered, msg.Object)
		}
	}
	return rendered, msg.Stats
}

func progressFromStats(stats *rcloneStats, mode rcloneProgressMode) (rcloneStatsUpdate, bool) {
	if stats == nil {
		return rcloneStatsUpdate{}, false
	}
	update := rcloneStatsUpdate{
		BytesDone: stats.Bytes,
	}
	if stats.TotalBytes > 0 {
		bt := stats.TotalBytes
		update.BytesTotal = &bt
	}

	switch mode {
	case rcloneProgressDeletes:
		update.ObjectsDone = stats.Deletes
	default:
		update.ObjectsDone = stats.Transfers
		if stats.TotalTransfers > 0 {
			ot := stats.TotalTransfers
			update.ObjectsTotal = &ot
		}
	}

	if stats.Speed > 0 {
		sp := int64(stats.Speed)
		update.SpeedBps = &sp
	}
	if stats.Eta != nil && *stats.Eta > 0 {
		eta := int(math.Round(*stats.Eta))
		update.EtaSeconds = &eta
	}
	return update, true
	}

func (m *Manager) TestConnectivity(ctx context.Context, profileID string) (ok bool, details map[string]any, err error) {
	profileSecrets, found, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return false, nil, err
	}
	if !found {
		return false, nil, ErrProfileNotFound
	}

	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	configID := fmt.Sprintf("profile-test-%s-%d", profileID, time.Now().UnixNano())
	proc, err := m.startRcloneCommand(callCtx, profileSecrets, configID, []string{"lsjson", "--dirs-only", rcloneRemoteBucket("")})
	if err != nil {
		return false, nil, err
	}

	bucketCount := 0
	listErr := decodeRcloneList(proc.stdout, func(entry rcloneListEntry) error {
		if entry.IsDir || entry.IsBucket {
			bucketCount++
		}
		return nil
	})
	waitErr := proc.wait()

	details = map[string]any{"provider": profileSecrets.Provider}
	if rcloneconfig.IsS3LikeProvider(profileSecrets.Provider) {
		storageType, storageSource := detectStorageType(profileSecrets.Endpoint, nil)
		if storageType != "" {
			details["storageType"] = storageType
		}
		if storageSource != "" {
			details["storageTypeSource"] = storageSource
		}
	}

	if listErr != nil {
		details["error"] = listErr.Error()
		cls := rcloneerrors.Classify(listErr, proc.stderr.String())
		details["normalizedError"] = map[string]any{
			"code":      string(cls.Code),
			"retryable": cls.Retryable,
		}
		return false, details, nil
	}
	if waitErr != nil {
		msg := strings.TrimSpace(proc.stderr.String())
		if msg == "" {
			msg = waitErr.Error()
		}
		details["error"] = msg
		cls := rcloneerrors.Classify(waitErr, proc.stderr.String())
		details["normalizedError"] = map[string]any{
			"code":      string(cls.Code),
			"retryable": cls.Retryable,
		}
		return false, details, nil
	}
	details["buckets"] = bucketCount
	return true, details, nil
}

// TestS3Connectivity is kept for backwards compatibility.
func (m *Manager) TestS3Connectivity(ctx context.Context, profileID string) (ok bool, details map[string]any, err error) {
	return m.TestConnectivity(ctx, profileID)
}

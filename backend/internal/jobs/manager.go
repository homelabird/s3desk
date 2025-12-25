package jobs

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"object-storage/internal/models"
	"object-storage/internal/s3client"
	"object-storage/internal/store"
	"object-storage/internal/ws"
)

const (
	JobTypeS5CmdSyncLocalToS3        = "s5cmd_sync_local_to_s3"
	JobTypeS5CmdSyncStagingToS3      = "s5cmd_sync_staging_to_s3"
	JobTypeS5CmdSyncS3ToLocal        = "s5cmd_sync_s3_to_local"
	JobTypeS5CmdRmPrefix             = "s5cmd_rm_prefix"
	JobTypeS5CmdCpS3ToS3             = "s5cmd_cp_s3_to_s3"
	JobTypeS5CmdMvS3ToS3             = "s5cmd_mv_s3_to_s3"
	JobTypeS5CmdCpS3ToS3Batch        = "s5cmd_cp_s3_to_s3_batch"
	JobTypeS5CmdMvS3ToS3Batch        = "s5cmd_mv_s3_to_s3_batch"
	JobTypeS5CmdCpS3PrefixToS3Prefix = "s5cmd_cp_s3_prefix_to_s3_prefix"
	JobTypeS5CmdMvS3PrefixToS3Prefix = "s5cmd_mv_s3_prefix_to_s3_prefix"
	JobTypeS3ZipPrefix               = "s3_zip_prefix"
	JobTypeS3ZipObjects              = "s3_zip_objects"
	JobTypeS3DeleteObjects           = "s3_delete_objects"
	JobTypeS3IndexObjects            = "s3_index_objects"
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
	Concurrency      int
	JobLogMaxBytes   int64
	JobRetention     time.Duration
	AllowedLocalDirs []string
	UploadSessionTTL time.Duration
}

type Manager struct {
	store        *store.Store
	dataDir      string
	hub          *ws.Hub
	logMaxBytes  int64
	jobRetention time.Duration

	queue chan string
	sem   chan struct{}

	mu      sync.Mutex
	cancels map[string]context.CancelFunc
	pids    map[string]int

	uploadTTL time.Duration

	allowedLocalDirs []string
	logLineMaxBytes  int

	s5cmdTuneEnabled        bool
	s5cmdMaxNumWorkers      int
	s5cmdMaxConcurrency     int
	s5cmdMinPartSizeMiB     int
	s5cmdMaxPartSizeMiB     int
	s5cmdDefaultPartSizeMiB int
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
	defaultMaxNumWorkers := cpu * 64
	if defaultMaxNumWorkers < 256 {
		defaultMaxNumWorkers = 256
	}
	if defaultMaxNumWorkers > 2048 {
		defaultMaxNumWorkers = 2048
	}

	defaultMaxConcurrency := cpu * 4
	if defaultMaxConcurrency < 8 {
		defaultMaxConcurrency = 8
	}
	if defaultMaxConcurrency > 128 {
		defaultMaxConcurrency = 128
	}

	minPartSizeMiB := envInt("S5CMD_MIN_PART_SIZE_MIB", 16)
	if minPartSizeMiB < 5 {
		minPartSizeMiB = 5
	}
	maxPartSizeMiB := envInt("S5CMD_MAX_PART_SIZE_MIB", 128)
	if maxPartSizeMiB < minPartSizeMiB {
		maxPartSizeMiB = minPartSizeMiB
	}

	return &Manager{
		store:        cfg.Store,
		dataDir:      cfg.DataDir,
		hub:          cfg.Hub,
		logMaxBytes:  cfg.JobLogMaxBytes,
		jobRetention: cfg.JobRetention,
		queue:        make(chan string, queueCapacity),
		sem:          make(chan struct{}, concurrency),
		cancels:      make(map[string]context.CancelFunc),
		pids:         make(map[string]int),
		uploadTTL:    cfg.UploadSessionTTL,
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

		logLineMaxBytes:         logLineMaxBytes,
		s5cmdTuneEnabled:        envBool("S5CMD_TUNE", true),
		s5cmdMaxNumWorkers:      envInt("S5CMD_MAX_NUMWORKERS", defaultMaxNumWorkers),
		s5cmdMaxConcurrency:     envInt("S5CMD_MAX_CONCURRENCY", defaultMaxConcurrency),
		s5cmdMinPartSizeMiB:     minPartSizeMiB,
		s5cmdMaxPartSizeMiB:     maxPartSizeMiB,
		s5cmdDefaultPartSizeMiB: envInt("S5CMD_DEFAULT_PART_SIZE_MIB", 64),
	}
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

type s5cmdTune struct {
	NumWorkers  int
	Concurrency int
	PartSizeMiB int
	ActiveJobs  int
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

func clampInt(v, minV, maxV int) int {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
}

func (m *Manager) computeS5CmdTune(jobID string, commandArgs []string) (tune s5cmdTune, ok bool) {
	if !m.s5cmdTuneEnabled {
		return s5cmdTune{}, false
	}
	if len(commandArgs) == 0 {
		return s5cmdTune{}, false
	}

	switch commandArgs[0] {
	case "sync", "cp", "mv":
		// supported
	default:
		return s5cmdTune{}, false
	}

	activeJobs := len(m.sem)
	if activeJobs < 1 {
		activeJobs = 1
	}

	maxNumWorkers := m.s5cmdMaxNumWorkers
	if maxNumWorkers <= 0 {
		maxNumWorkers = 256
	}
	maxConcurrency := m.s5cmdMaxConcurrency
	if maxConcurrency <= 0 {
		maxConcurrency = 8
	}

	numWorkers := maxNumWorkers / activeJobs
	if numWorkers < 32 {
		numWorkers = 32
	}
	if numWorkers > maxNumWorkers {
		numWorkers = maxNumWorkers
	}

	concurrency := maxConcurrency / activeJobs
	if concurrency < 5 {
		concurrency = 5
	}
	if concurrency > maxConcurrency {
		concurrency = maxConcurrency
	}

	partSizeMiB := m.pickS5CmdPartSizeMiB(jobID)
	partSizeMiB = clampInt(partSizeMiB, m.s5cmdMinPartSizeMiB, m.s5cmdMaxPartSizeMiB)

	return s5cmdTune{
		NumWorkers:  numWorkers,
		Concurrency: concurrency,
		PartSizeMiB: partSizeMiB,
		ActiveJobs:  activeJobs,
	}, true
}

func (m *Manager) pickS5CmdPartSizeMiB(jobID string) int {
	def := m.s5cmdDefaultPartSizeMiB
	if def <= 0 {
		def = 64
	}

	jp := m.loadJobProgress(jobID)
	if jp == nil || jp.BytesTotal == nil || jp.ObjectsTotal == nil {
		return def
	}
	bt := *jp.BytesTotal
	ot := *jp.ObjectsTotal
	if bt <= 0 || ot <= 0 {
		return def
	}

	avgMiB := float64(bt) / float64(ot) / (1024 * 1024)
	switch {
	case avgMiB <= 64:
		return 16
	case avgMiB <= 256:
		return 32
	case avgMiB <= 1024:
		return 64
	default:
		return 128
	}
}

func applyS5CmdTuneToCommandArgs(commandArgs []string, tune s5cmdTune) []string {
	if len(commandArgs) == 0 {
		return commandArgs
	}
	cmd := commandArgs[0]
	switch cmd {
	case "sync", "cp", "mv":
		// ok
	default:
		return commandArgs
	}

	out := make([]string, 0, len(commandArgs)+4)
	out = append(out, cmd)
	if tune.Concurrency > 0 && !hasAnyFlag(commandArgs, "--concurrency", "-c") {
		out = append(out, "--concurrency", strconv.Itoa(tune.Concurrency))
	}
	if tune.PartSizeMiB > 0 && !hasAnyFlag(commandArgs, "--part-size", "-p") {
		out = append(out, "--part-size", strconv.Itoa(tune.PartSizeMiB))
	}
	out = append(out, commandArgs[1:]...)
	return out
}

func (m *Manager) RecoverAndRequeue(ctx context.Context) error {
	if err := m.store.MarkRunningJobsFailed(ctx, "server restarted"); err != nil {
		return err
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
		if !(strings.HasSuffix(name, ".log") || strings.HasSuffix(name, ".cmd")) {
			continue
		}
		jobID := strings.TrimSuffix(name, filepath.Ext(name))
		if jobID == "" {
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
	case JobTypeS5CmdSyncLocalToS3,
		JobTypeS5CmdSyncStagingToS3,
		JobTypeS5CmdSyncS3ToLocal,
		JobTypeS5CmdRmPrefix,
		JobTypeS5CmdCpS3ToS3,
		JobTypeS5CmdMvS3ToS3,
		JobTypeS5CmdCpS3ToS3Batch,
		JobTypeS5CmdMvS3ToS3Batch,
		JobTypeS5CmdCpS3PrefixToS3Prefix,
		JobTypeS5CmdMvS3PrefixToS3Prefix,
		JobTypeS3ZipPrefix,
		JobTypeS3ZipObjects,
		JobTypeS3DeleteObjects,
		JobTypeS3IndexObjects:
		return true
	default:
		return false
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

	ctx, cancel := context.WithCancel(rootCtx)
	m.mu.Lock()
	m.cancels[jobID] = cancel
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		delete(m.cancels, jobID)
		delete(m.pids, jobID)
		m.mu.Unlock()
	}()

	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := m.store.UpdateJobStatus(rootCtx, jobID, models.JobStatusRunning, &startedAt, nil, nil, nil); err != nil {
		return err
	}
	m.hub.Publish(ws.Event{Type: "job.progress", JobID: jobID, Payload: map[string]any{"status": models.JobStatusRunning}})

	var runErr error
	switch job.Type {
	case JobTypeS5CmdSyncStagingToS3:
		runErr = m.runS5CmdSyncStagingToS3(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdSyncLocalToS3:
		runErr = m.runS5CmdSyncLocalToS3(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdSyncS3ToLocal:
		runErr = m.runS5CmdSyncS3ToLocal(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdRmPrefix:
		runErr = m.runS5CmdRmPrefix(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdCpS3ToS3:
		runErr = m.runS5CmdCpS3ToS3(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdMvS3ToS3:
		runErr = m.runS5CmdMvS3ToS3(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdCpS3ToS3Batch:
		runErr = m.runS5CmdCpS3ToS3Batch(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdMvS3ToS3Batch:
		runErr = m.runS5CmdMvS3ToS3Batch(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdCpS3PrefixToS3Prefix:
		runErr = m.runS5CmdCpS3PrefixToS3Prefix(ctx, profileID, jobID, job.Payload)
	case JobTypeS5CmdMvS3PrefixToS3Prefix:
		runErr = m.runS5CmdMvS3PrefixToS3Prefix(ctx, profileID, jobID, job.Payload)
	case JobTypeS3ZipPrefix:
		runErr = m.runS3ZipPrefix(ctx, profileID, jobID, job.Payload)
	case JobTypeS3ZipObjects:
		runErr = m.runS3ZipObjects(ctx, profileID, jobID, job.Payload)
	case JobTypeS3DeleteObjects:
		runErr = m.runS3DeleteObjects(ctx, profileID, jobID, job.Payload)
	case JobTypeS3IndexObjects:
		runErr = m.runS3IndexObjects(ctx, profileID, jobID, job.Payload)
	default:
		runErr = fmt.Errorf("unsupported job type: %s", job.Type)
	}

	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if errors.Is(ctx.Err(), context.Canceled) {
		_ = m.finalizeJob(jobID, models.JobStatusCanceled, &finishedAt, nil)

		payload := map[string]any{"status": models.JobStatusCanceled}
		if jp := m.loadJobProgress(jobID); jp != nil {
			payload["progress"] = jp
		}
		m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
		return nil
	}
	if runErr != nil {
		msg := runErr.Error()
		_ = m.finalizeJob(jobID, models.JobStatusFailed, &finishedAt, &msg)
		payload := map[string]any{"status": models.JobStatusFailed, "error": msg}
		if jp := m.loadJobProgress(jobID); jp != nil {
			payload["progress"] = jp
		}
		m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
		return runErr
	}

	_ = m.finalizeJob(jobID, models.JobStatusSucceeded, &finishedAt, nil)
	payload := map[string]any{"status": models.JobStatusSucceeded}
	if jp := m.loadJobProgress(jobID); jp != nil {
		payload["progress"] = jp
	}
	m.hub.Publish(ws.Event{Type: "job.completed", JobID: jobID, Payload: payload})
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

func (m *Manager) finalizeJob(jobID string, status models.JobStatus, finishedAt *string, errMsg *string) error {
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
	err = m.store.UpdateJobStatus(updateCtx, jobID, status, nil, finishedAt, jp, errMsg)
	cancel()
	return err
}

func (m *Manager) runS5CmdSyncStagingToS3(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	uploadID, _ := payload["uploadId"].(string)
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

	// Sync staging dir -> s3://bucket/prefix/
	src := filepath.Clean(us.StagingDir)
	dst := s3URI(us.Bucket, us.Prefix)

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	if totals, err := computeLocalTotals(preflightCtx, src, nil, nil); err == nil {
		m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
	}
	cancel()
	err = m.runS5CmdSync(ctx, profileID, jobID, src, dst, false, nil, nil, false)
	if err != nil {
		return err
	}

	// Cleanup staging on success (best-effort).
	_, _ = m.store.DeleteUploadSession(context.Background(), profileID, uploadID)
	_ = os.RemoveAll(src)
	return nil
}

func (m *Manager) runS5CmdSyncLocalToS3(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	localPath, _ := payload["localPath"].(string)
	if bucket == "" || localPath == "" {
		return errors.New("payload.bucket and payload.localPath are required")
	}

	dryRun, _ := payload["dryRun"].(bool)
	deleteExtraneous, _ := payload["deleteExtraneous"].(bool)
	include := stringSlice(payload["include"])
	exclude := stringSlice(payload["exclude"])

	src := filepath.Clean(localPath)
	if err := m.ensureLocalPathAllowed(src); err != nil {
		return err
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	if totals, err := computeLocalTotals(preflightCtx, src, include, exclude); err == nil {
		m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
	}
	cancel()
	dst := s3URI(bucket, prefix)
	return m.runS5CmdSync(ctx, profileID, jobID, src, dst, deleteExtraneous, include, exclude, dryRun)
}

func (m *Manager) runS5CmdSyncS3ToLocal(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	localPath, _ := payload["localPath"].(string)
	if bucket == "" || localPath == "" {
		return errors.New("payload.bucket and payload.localPath are required")
	}

	dryRun, _ := payload["dryRun"].(bool)
	deleteExtraneous, _ := payload["deleteExtraneous"].(bool)
	include := stringSlice(payload["include"])
	exclude := stringSlice(payload["exclude"])

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")
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
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, bucket, normalizePrefix(prefix), include, exclude)
	cancel()

	srcPattern := s3SyncPattern(bucket, prefix)

	args := []string{"sync"}
	if deleteExtraneous {
		args = append(args, "--delete")
	}
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
	args = append(args, srcPattern, dst)

	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

func (m *Manager) runS5CmdRmPrefix(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	deleteAll, _ := payload["deleteAll"].(bool)
	dryRun, _ := payload["dryRun"].(bool)
	allowUnsafePrefix, _ := payload["allowUnsafePrefix"].(bool)
	include := stringSlice(payload["include"])
	exclude := stringSlice(payload["exclude"])

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimLeft(strings.TrimSpace(prefix), "/")

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
	m.trySetJobObjectsTotalFromS3Prefix(preflightCtx, profileID, jobID, bucket, prefix, include, exclude)
	cancel()

	pattern := s3DeletePattern(bucket, prefix)

	args := []string{"rm"}
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
	args = append(args, pattern)

	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

func (m *Manager) runS5CmdCpS3ToS3(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcKey, _ := payload["srcKey"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstKey, _ := payload["dstKey"].(string)
	dryRun, _ := payload["dryRun"].(bool)

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	m.trySetJobTotalsFromS3Object(ctx, profileID, jobID, srcBucket, srcKey)

	args := []string{"cp", s3ObjectURI(srcBucket, srcKey), s3ObjectURI(dstBucket, dstKey)}
	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

func (m *Manager) runS5CmdMvS3ToS3(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcKey, _ := payload["srcKey"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstKey, _ := payload["dstKey"].(string)
	dryRun, _ := payload["dryRun"].(bool)

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	m.trySetJobTotalsFromS3Object(ctx, profileID, jobID, srcBucket, srcKey)

	args := []string{"mv", s3ObjectURI(srcBucket, srcKey), s3ObjectURI(dstBucket, dstKey)}
	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

func (m *Manager) runS5CmdCpS3ToS3Batch(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	rawItems, _ := payload["items"].([]any)
	dryRun, _ := payload["dryRun"].(bool)

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)
	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if len(rawItems) < 1 {
		return errors.New("payload.items is required")
	}

	pairs := make([]s3KeyPair, 0, len(rawItems))
	for i, item := range rawItems {
		mm, ok := item.(map[string]any)
		if !ok {
			return fmt.Errorf("payload.items[%d] must be an object", i)
		}
		srcKey, _ := mm["srcKey"].(string)
		dstKey, _ := mm["dstKey"].(string)
		srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
		dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")
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

	runPath := filepath.Join(m.dataDir, "logs", "jobs", jobID+".cmd")
	if err := writeS5CmdRunFile(runPath, "cp", srcBucket, dstBucket, pairs); err != nil {
		return err
	}

	args := []string{"run", runPath}
	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

func (m *Manager) runS5CmdMvS3ToS3Batch(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	rawItems, _ := payload["items"].([]any)
	dryRun, _ := payload["dryRun"].(bool)

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)
	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if len(rawItems) < 1 {
		return errors.New("payload.items is required")
	}

	pairs := make([]s3KeyPair, 0, len(rawItems))
	for i, item := range rawItems {
		mm, ok := item.(map[string]any)
		if !ok {
			return fmt.Errorf("payload.items[%d] must be an object", i)
		}
		srcKey, _ := mm["srcKey"].(string)
		dstKey, _ := mm["dstKey"].(string)
		srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
		dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")
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

	runPath := filepath.Join(m.dataDir, "logs", "jobs", jobID+".cmd")
	if err := writeS5CmdRunFile(runPath, "mv", srcBucket, dstBucket, pairs); err != nil {
		return err
	}

	args := []string{"run", runPath}
	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

func writeS5CmdRunFile(path, op, srcBucket, dstBucket string, pairs []s3KeyPair) error {
	if op != "cp" && op != "mv" {
		return fmt.Errorf("unsupported op %q", op)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	for _, p := range pairs {
		if p.SrcKey == "" || p.DstKey == "" {
			continue
		}
		if _, err := fmt.Fprintf(f, "%s %s %s\n", op, s3ObjectURI(srcBucket, p.SrcKey), s3ObjectURI(dstBucket, p.DstKey)); err != nil {
			return err
		}
	}
	return f.Close()
}

func (m *Manager) trySetJobTotals(jobID string, objectsTotal, bytesTotal int64) {
	ot := objectsTotal
	bt := bytesTotal
	jp := &models.JobProgress{ObjectsTotal: &ot, BytesTotal: &bt}

	updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil)
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
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil)
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

func (m *Manager) trySetJobTotalsFromS3Object(ctx context.Context, profileID, jobID, bucket, key string) {
	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return
	}

	client, err := s3client.New(ctx, profileSecrets)
	if err != nil {
		return
	}

	headCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	out, err := client.HeadObject(headCtx, &s3.HeadObjectInput{
		Bucket: &bucket,
		Key:    &key,
	})
	if err != nil {
		return
	}

	ot := int64(1)
	jp := &models.JobProgress{ObjectsTotal: &ot}
	if out.ContentLength != nil {
		bt := *out.ContentLength
		jp.BytesTotal = &bt
	}

	updateCtx, cancel2 := context.WithTimeout(context.Background(), 2*time.Second)
	_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil)
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

func (m *Manager) trySetJobTotalsFromS3Prefix(ctx context.Context, profileID, jobID, bucket, prefix string, include, exclude []string) {
	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return
	}

	client, err := s3client.New(ctx, profileSecrets)
	if err != nil {
		return
	}

	totals, ok, err := computeS3PrefixTotals(ctx, client, bucket, prefix, include, exclude, 0)
	if err != nil || !ok {
		return
	}

	m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
}

func (m *Manager) trySetJobObjectsTotalFromS3Prefix(ctx context.Context, profileID, jobID, bucket, prefix string, include, exclude []string) {
	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return
	}

	client, err := s3client.New(ctx, profileSecrets)
	if err != nil {
		return
	}

	totals, ok, err := computeS3PrefixTotals(ctx, client, bucket, prefix, include, exclude, 0)
	if err != nil || !ok {
		return
	}

	m.trySetJobObjectsTotal(jobID, totals.Objects)
}

func (m *Manager) runS5CmdCpS3PrefixToS3Prefix(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcPrefix, _ := payload["srcPrefix"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstPrefix, _ := payload["dstPrefix"].(string)
	dryRun, _ := payload["dryRun"].(bool)
	include := stringSlice(payload["include"])
	exclude := stringSlice(payload["exclude"])

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = strings.TrimPrefix(strings.TrimSpace(srcPrefix), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = strings.TrimPrefix(strings.TrimSpace(dstPrefix), "/")

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
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, srcBucket, srcPrefix, include, exclude)
	cancel()

	srcPattern := fmt.Sprintf("s3://%s/%s*", srcBucket, srcPrefix)
	dstURI := s3URI(dstBucket, dstPrefix)

	args := []string{"cp"}
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
	args = append(args, srcPattern, dstURI)

	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

func (m *Manager) runS5CmdMvS3PrefixToS3Prefix(ctx context.Context, profileID, jobID string, payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcPrefix, _ := payload["srcPrefix"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstPrefix, _ := payload["dstPrefix"].(string)
	dryRun, _ := payload["dryRun"].(bool)
	include := stringSlice(payload["include"])
	exclude := stringSlice(payload["exclude"])

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = strings.TrimPrefix(strings.TrimSpace(srcPrefix), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = strings.TrimPrefix(strings.TrimSpace(dstPrefix), "/")

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
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, srcBucket, srcPrefix, include, exclude)
	cancel()

	srcPattern := fmt.Sprintf("s3://%s/%s*", srcBucket, srcPrefix)
	dstURI := s3URI(dstBucket, dstPrefix)

	args := []string{"mv"}
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
	args = append(args, srcPattern, dstURI)

	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
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

	// Normalize to a directory target for s5cmd.
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

func normalizePrefix(prefix string) string {
	p := strings.TrimPrefix(prefix, "/")
	if p != "" && !strings.HasSuffix(p, "/") {
		p += "/"
	}
	return p
}

func s3SyncPattern(bucket, prefix string) string {
	p := normalizePrefix(prefix)
	if p == "" {
		return fmt.Sprintf("s3://%s/*", bucket)
	}
	return fmt.Sprintf("s3://%s/%s*", bucket, p)
}

func (m *Manager) runS5CmdSync(ctx context.Context, profileID, jobID, src, dst string, deleteExtraneous bool, include, exclude []string, dryRun bool) error {
	args := []string{"sync"}
	if deleteExtraneous {
		args = append(args, "--delete")
	}
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

	args = append(args, normalizeSyncSource(src), dst)
	return m.runS5Cmd(ctx, profileID, jobID, args, runS5CmdOptions{TrackProgress: true, DryRun: dryRun})
}

type runS5CmdOptions struct {
	TrackProgress bool
	DryRun        bool
}

type progressDelta struct {
	Objects int64
	Bytes   int64
}

func (m *Manager) runS5Cmd(ctx context.Context, profileID, jobID string, commandArgs []string, opts runS5CmdOptions) error {
	s5cmdPath, err := ResolveS5CmdPath()
	if err != nil {
		return err
	}

	profileSecrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("profile not found")
	}

	tune, tuneOK := m.computeS5CmdTune(jobID, commandArgs)
	if tuneOK {
		commandArgs = applyS5CmdTuneToCommandArgs(commandArgs, tune)
	}

	args := []string{}
	if profileSecrets.Endpoint != "" {
		args = append(args, "--endpoint-url", profileSecrets.Endpoint)
	}
	if profileSecrets.TLSInsecureSkipVerify {
		args = append(args, "--no-verify-ssl")
	}
	if tuneOK && tune.NumWorkers > 0 && !hasAnyFlag(args, "--numworkers") {
		args = append(args, "--numworkers", strconv.Itoa(tune.NumWorkers))
	}
	args = append(args, "--json")
	if opts.DryRun {
		args = append(args, "--dry-run")
	}
	args = append(args, commandArgs...)

	logPath := filepath.Join(m.dataDir, "logs", "jobs", jobID+".log")
	logWriter, err := openJobLogWriter(logPath, m.logMaxBytes)
	if err != nil {
		return err
	}
	defer func() { _ = logWriter.Close() }()

	if tuneOK {
		_, _ = logWriter.Write([]byte(fmt.Sprintf("[info] s5cmd tune: activeJobs=%d numWorkers=%d concurrency=%d partSizeMiB=%d\n", tune.ActiveJobs, tune.NumWorkers, tune.Concurrency, tune.PartSizeMiB)))
	}

	var (
		progressCh   chan progressDelta
		progressDone chan struct{}
	)
	if opts.TrackProgress {
		progressCh = make(chan progressDelta, 1024)
		progressDone = make(chan struct{})
		go func() {
			defer close(progressDone)
			m.trackProgress(ctx, jobID, progressCh)
		}()
	}

	cmd := exec.CommandContext(ctx, s5cmdPath, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Env = append(os.Environ(),
		"AWS_ACCESS_KEY_ID="+profileSecrets.AccessKeyID,
		"AWS_SECRET_ACCESS_KEY="+profileSecrets.SecretAccessKey,
		"AWS_REGION="+profileSecrets.Region,
		"AWS_DEFAULT_REGION="+profileSecrets.Region,
	)
	if profileSecrets.SessionToken != nil && *profileSecrets.SessionToken != "" {
		cmd.Env = append(cmd.Env, "AWS_SESSION_TOKEN="+*profileSecrets.SessionToken)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	m.mu.Lock()
	if cmd.Process != nil {
		m.pids[jobID] = cmd.Process.Pid
	}
	m.mu.Unlock()

	go func() {
		<-ctx.Done()
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
	}()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		pipeLogs(ctx, stdout, logWriter, m.hub, jobID, "info", progressCh, m.logLineMaxBytes)
	}()
	go func() {
		defer wg.Done()
		pipeLogs(ctx, stderr, logWriter, m.hub, jobID, "error", nil, m.logLineMaxBytes)
	}()

	waitErr := cmd.Wait()
	wg.Wait()

	if progressCh != nil {
		close(progressCh)
		<-progressDone
	}
	return waitErr
}

func (m *Manager) trackProgress(ctx context.Context, jobID string, progress <-chan progressDelta) {
	ticker := time.NewTicker(jobProgressTick)
	defer ticker.Stop()

	var (
		objectsDone  int64
		bytesDone    int64
		lastSentOps  int64
		lastSentB    int64
		lastSentAt   = time.Now()
		lastOpsRate  float64
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

	flush := func() {
		if objectsDone == lastSentOps && bytesDone == lastSentB {
			return
		}
		now := time.Now()
		elapsed := now.Sub(lastSentAt).Seconds()
		lastSentAt = now

		opsDelta := objectsDone - lastSentOps
		bytesDelta := bytesDone - lastSentB
		lastSentOps = objectsDone
		lastSentB = bytesDone

		od := objectsDone
		bd := bytesDone
		if objectsTotal == nil || bytesTotal == nil {
			loadTotals()
		}

		jp := &models.JobProgress{
			ObjectsDone:  &od,
			BytesDone:    &bd,
			ObjectsTotal: objectsTotal,
			BytesTotal:   bytesTotal,
		}
		if elapsed > 0 && opsDelta > 0 {
			lastOpsRate = float64(opsDelta) / elapsed
			opsPerSecond := int64(math.Round(lastOpsRate))
			if opsPerSecond < 1 {
				opsPerSecond = 1
			}
			jp.ObjectsPerSecond = &opsPerSecond
		}
		if elapsed > 0 && bytesDelta > 0 && opsDelta >= 0 {
			sp := int64(float64(bytesDelta) / elapsed)
			if sp < 0 {
				sp = 0
			}
			jp.SpeedBps = &sp
		}
		switch {
		case jp.BytesTotal != nil && jp.SpeedBps != nil && *jp.SpeedBps > 0:
			remaining := *jp.BytesTotal - bytesDone
			if remaining > 0 {
				eta64 := remaining / *jp.SpeedBps
				if remaining%*jp.SpeedBps != 0 {
					eta64++
				}
				maxInt := int64(int(^uint(0) >> 1))
				if eta64 > maxInt {
					eta64 = maxInt
				}
				eta := int(eta64)
				jp.EtaSeconds = &eta
			}
		case jp.ObjectsTotal != nil && lastOpsRate > 0:
			remaining := *jp.ObjectsTotal - objectsDone
			if remaining > 0 {
				eta64 := int64(math.Ceil(float64(remaining) / lastOpsRate))
				maxInt := int64(int(^uint(0) >> 1))
				if eta64 > maxInt {
					eta64 = maxInt
				}
				if eta64 > 0 {
					eta := int(eta64)
					jp.EtaSeconds = &eta
				}
			}
		}

		updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = m.store.UpdateJobStatus(updateCtx, jobID, models.JobStatusRunning, nil, nil, jp, nil)
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

	for {
		select {
		case <-ctx.Done():
			flush()
			return
		case d, ok := <-progress:
			if !ok {
				flush()
				return
			}
			objectsDone += d.Objects
			bytesDone += d.Bytes
		case <-ticker.C:
			flush()
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

func pipeLogs(ctx context.Context, r io.Reader, w io.Writer, hub *ws.Hub, jobID, level string, progressCh chan<- progressDelta, maxLineBytes int) {
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

		rendered, delta := formatS5CmdJSONLine(line)
		if rendered == "" {
			rendered = line
		}

		_, _ = w.Write([]byte("[" + level + "] " + rendered + "\n"))
		if progressCh != nil {
			if delta.Objects == 0 && delta.Bytes == 0 {
				if isS5CmdOperationLine(line) {
					delta.Objects = 1
				}
			}
			if delta.Objects != 0 || delta.Bytes != 0 {
				select {
				case progressCh <- delta:
				default:
				}
			}
		}
		hub.Publish(ws.Event{
			Type:  "job.log",
			JobID: jobID,
			Payload: map[string]any{
				"level":   level,
				"message": rendered,
			},
		})

		if errors.Is(err, io.EOF) {
			return
		}
	}
}

func isS5CmdOperationLine(line string) bool {
	return strings.HasPrefix(line, "cp ") || strings.HasPrefix(line, "rm ") || strings.HasPrefix(line, "mv ")
}

func formatS5CmdJSONLine(line string) (rendered string, delta progressDelta) {
	var msg map[string]any
	if err := json.Unmarshal([]byte(line), &msg); err != nil {
		return "", progressDelta{}
	}

	op, _ := msg["operation"].(string)
	if op == "" {
		return "", progressDelta{}
	}

	switch op {
	case "cp", "mv", "rm", "sync":
		// supported
	default:
		return "", progressDelta{}
	}

	success, hasSuccess := msg["success"].(bool)
	if !hasSuccess || success {
		delta.Objects = 1

		// s5cmd JSON uses `object.size` for file operations.
		if obj, ok := msg["object"].(map[string]any); ok {
			if size, ok := obj["size"].(float64); ok {
				if size > 0 {
					delta.Bytes = int64(size)
				}
			}
		} else if size, ok := msg["size"].(float64); ok {
			if size > 0 {
				delta.Bytes = int64(size)
			}
		}
	}

	if cmd, ok := msg["command"].(string); ok && cmd != "" {
		rendered = cmd
	} else {
		src, _ := msg["source"].(string)
		dst, _ := msg["destination"].(string)
		switch {
		case src != "" && dst != "":
			rendered = fmt.Sprintf("%s %s -> %s", op, src, dst)
		case src != "":
			rendered = fmt.Sprintf("%s %s", op, src)
		default:
			rendered = op
		}
	}

	if hasSuccess && !success {
		if errStr, ok := msg["error"].(string); ok && errStr != "" {
			rendered = fmt.Sprintf("%s (error: %s)", rendered, errStr)
		}
	}

	return rendered, delta
}

func s3DeletePattern(bucket, prefix string) string {
	p := strings.TrimLeft(strings.TrimSpace(prefix), "/")
	if p == "" {
		return fmt.Sprintf("s3://%s/*", bucket)
	}
	return fmt.Sprintf("s3://%s/%s*", bucket, p)
}

func normalizeSyncSource(path string) string {
	clean := filepath.Clean(path)
	// Recommend globbing to sync contents of a directory (consistent with s5cmd docs).
	info, err := os.Stat(clean)
	if err == nil && info.IsDir() {
		return filepath.Join(clean, "*")
	}
	return clean
}

func s3URI(bucket, prefix string) string {
	p := strings.TrimPrefix(prefix, "/")
	if p != "" && !strings.HasSuffix(p, "/") {
		p += "/"
	}
	if p == "" {
		return fmt.Sprintf("s3://%s/", bucket)
	}
	return fmt.Sprintf("s3://%s/%s", bucket, p)
}

func s3ObjectURI(bucket, key string) string {
	k := strings.TrimPrefix(key, "/")
	return fmt.Sprintf("s3://%s/%s", bucket, k)
}

func stringSlice(v any) []string {
	raw, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		s, ok := item.(string)
		if !ok {
			continue
		}
		out = append(out, s)
	}
	return out
}

func findLocalS5Cmd() (path string, ok bool) {
	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "s5cmd"),
			filepath.Join(exeDir, "bin", "s5cmd"),
		)
	}
	candidates = append(candidates,
		filepath.Join(".tools", "bin", "s5cmd"),
		filepath.Join("..", ".tools", "bin", "s5cmd"),
		filepath.Join("dist", "bin", "s5cmd"),
		filepath.Join("..", "dist", "bin", "s5cmd"),
	)
	for _, p := range candidates {
		info, err := os.Stat(p)
		if err != nil || info.IsDir() {
			continue
		}
		return p, true
	}
	return "", false
}

func (m *Manager) TestS3Connectivity(ctx context.Context, profileID string) (ok bool, details map[string]any, err error) {
	profileSecrets, found, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return false, nil, err
	}
	if !found {
		return false, nil, errors.New("profile not found")
	}

	client, err := s3client.New(ctx, profileSecrets)
	if err != nil {
		return false, nil, err
	}

	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	out, err := client.ListBuckets(callCtx, &s3.ListBucketsInput{})
	if err != nil {
		return false, map[string]any{"error": err.Error()}, nil
	}
	return true, map[string]any{"buckets": len(out.Buckets)}, nil
}

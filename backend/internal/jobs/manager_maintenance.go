package jobs

import (
	"context"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/logging"
	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/s3client"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

const orphanAPIRcloneConfigRetention = 24 * time.Hour

func (m *Manager) recordMaintenanceError(resource, operation string, err error) {
	if err == nil || os.IsNotExist(err) {
		return
	}
	m.metrics.AddMaintenanceCleanup(resource, "error", 1)
	logging.ErrorFields("maintenance cleanup failed", map[string]any{
		"event":     "maintenance.cleanup_failed",
		"resource":  resource,
		"operation": operation,
		"error":     err.Error(),
	})
}

func (m *Manager) removeMaintenancePath(resource, operation, target string, recursive bool) {
	var err error
	if recursive {
		err = os.RemoveAll(target)
	} else {
		err = os.Remove(target)
	}
	if err != nil {
		m.recordMaintenanceError(resource, operation, err)
		return
	}
	m.metrics.AddMaintenanceCleanup(resource, "deleted", 1)
}

func (m *Manager) RunMaintenance(ctx context.Context) {
	m.lifecycleWG.Add(1)
	m.runMaintenance(ctx)
}

func (m *Manager) runMaintenance(ctx context.Context) {
	defer m.lifecycleWG.Done()
	if ctx.Err() != nil {
		return
	}

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
	const resource = "upload_sessions"
	m.metrics.AddMaintenanceCleanup(resource, "run", 1)
	now := time.Now().UTC().Format(time.RFC3339Nano)

	for {
		sessions, err := m.store.ListExpiredUploadSessions(ctx, now, 200)
		if err != nil {
			m.recordMaintenanceError(resource, "list_expired", err)
			return
		}
		if len(sessions) == 0 {
			return
		}
		deleted := 0
		for _, us := range sessions {
			select {
			case <-ctx.Done():
				return
			default:
			}
			logCleanupError := func(step string, err error) {
				if err == nil {
					return
				}
				m.metrics.AddMaintenanceCleanup(resource, "error", 1)
				logging.ErrorFields("expired upload session cleanup failed", map[string]any{
					"event":      "upload.expired_cleanup_failed",
					"profile_id": us.ProfileID,
					"upload_id":  us.ID,
					"step":       step,
					"error":      err.Error(),
				})
			}
			if err := m.cleanupExpiredUploadSessionRemoteState(ctx, us); err != nil {
				logCleanupError("remote_state", err)
				continue
			}
			if err := m.store.DeleteMultipartUploadsBySession(ctx, us.ProfileID, us.ID); err != nil {
				logCleanupError("multipart_metadata", err)
				continue
			}
			if err := m.store.DeleteUploadObjectsBySession(ctx, us.ProfileID, us.ID); err != nil {
				logCleanupError("upload_object_metadata", err)
				continue
			}
			if us.StagingDir != "" {
				stagingDir, err := store.ResolveUploadStagingDir(m.dataDir, us.ID)
				if err != nil {
					logCleanupError("staging_path", err)
					continue
				}
				if err := os.RemoveAll(stagingDir); err != nil {
					logCleanupError("staging_directory", err)
					continue
				}
			}
			if _, err := m.store.DeleteUploadSession(ctx, us.ProfileID, us.ID); err != nil {
				logCleanupError("upload_session", err)
				continue
			}
			deleted++
			m.metrics.AddMaintenanceCleanup(resource, "deleted", 1)
		}
		if deleted == 0 {
			return
		}
	}
}

func (m *Manager) cleanupExpiredUploadSessionRemoteState(ctx context.Context, us store.UploadSession) error {
	if err := m.cleanupExpiredUploadSessionMultipartUploads(ctx, us); err != nil {
		return err
	}
	return m.cleanupExpiredUploadSessionRemoteTemps(ctx, us)
}

func (m *Manager) cleanupExpiredUploadSessionMultipartUploads(ctx context.Context, us store.UploadSession) error {
	uploads, err := m.store.ListMultipartUploads(ctx, us.ProfileID, us.ID)
	if err != nil {
		return err
	}
	if len(uploads) == 0 {
		return nil
	}

	secrets, ok, err := m.store.GetProfileSecrets(ctx, us.ProfileID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("profile %q not found for multipart cleanup", us.ProfileID)
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return fmt.Errorf("multipart cleanup requires an S3-compatible profile")
	}
	client, err := s3ClientFromProfile(secrets, m.allowRemote)
	if err != nil {
		return err
	}

	for _, meta := range uploads {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := abortStoredMultipartUpload(ctx, client, meta); err != nil {
			return fmt.Errorf("abort multipart upload %q/%q: %w", meta.Bucket, meta.ObjectKey, err)
		}
		if err := m.store.DeleteMultipartUpload(ctx, meta.ProfileID, meta.UploadID, meta.Path); err != nil {
			return err
		}
	}
	return nil
}

func abortStoredMultipartUpload(ctx context.Context, client *s3.Client, meta store.MultipartUpload) error {
	return s3client.AbortMultipartUpload(ctx, client, meta.Bucket, meta.ObjectKey, meta.S3UploadID)
}

func (m *Manager) cleanupExpiredUploadSessionRemoteTemps(ctx context.Context, us store.UploadSession) error {
	if strings.TrimSpace(strings.ToLower(us.Mode)) != "direct" {
		return nil
	}
	if strings.TrimSpace(us.ID) == "" || strings.TrimSpace(us.Bucket) == "" {
		return nil
	}

	secrets, ok, err := m.store.GetProfileSecrets(ctx, us.ProfileID)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	tempPrefix := directUploadTempSessionPrefix(us.Prefix, us.ID)
	target := rcloneRemoteDir(us.Bucket, tempPrefix, secrets.PreserveLeadingSlash)
	proc, err := m.startRcloneCommand(ctx, secrets, "upload-session-cleanup-"+us.ID, []string{"delete", target})
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, proc.stdout)
	if err := proc.wait(); err != nil {
		return jobErrorFromRclone(err, proc.stderr.String(), "rclone delete")
	}
	return nil
}

func directUploadTempSessionPrefix(prefix, uploadID string) string {
	tempPrefix := path.Join(".s3desk-upload-temp", uploadID)
	if prefix == "" {
		return tempPrefix
	}
	return path.Join(prefix, tempPrefix)
}

func (m *Manager) cleanupOrphanArtifacts(ctx context.Context) {
	m.cleanupOrphanJobLogs(ctx)
	m.cleanupOrphanJobArtifacts(ctx)
	m.cleanupOrphanStagingDirs(ctx)
	m.cleanupOrphanAPIRcloneConfigs(ctx)
}

func (m *Manager) cleanupOrphanAPIRcloneConfigs(ctx context.Context) {
	m.cleanupAPIRcloneConfigs(ctx, false)
}

func (m *Manager) cleanupStartupAPIRcloneConfigs(ctx context.Context) {
	m.cleanupAPIRcloneConfigs(ctx, true)
}

func (m *Manager) cleanupAPIRcloneConfigs(ctx context.Context, removeAll bool) {
	const resource = "api_rclone_configs"
	m.metrics.AddMaintenanceCleanup(resource, "run", 1)
	dir := filepath.Join(m.dataDir, "tmp", "rclone")
	entries, err := os.ReadDir(dir)
	if err != nil {
		m.recordMaintenanceError(resource, "read_directory", err)
		return
	}
	cutoff := time.Now().Add(-orphanAPIRcloneConfigRetention)
	for _, entry := range entries {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".rclone.conf") {
			continue
		}
		if removeAll {
			m.removeMaintenancePath(resource, "remove_startup_config", filepath.Join(dir, entry.Name()), false)
			continue
		}
		info, err := entry.Info()
		if err != nil {
			m.recordMaintenanceError(resource, "inspect_config", err)
			continue
		}
		if info.ModTime().After(cutoff) {
			continue
		}
		m.removeMaintenancePath(resource, "remove_expired_config", filepath.Join(dir, entry.Name()), false)
	}
}

func (m *Manager) cleanupOldJobs(ctx context.Context) {
	if m.jobRetention <= 0 {
		return
	}
	const resource = "jobs"
	m.metrics.AddMaintenanceCleanup(resource, "run", 1)

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
		if err != nil {
			m.recordMaintenanceError(resource, "delete_finished", err)
			return
		}
		if len(ids) == 0 {
			return
		}
		m.metrics.AddMaintenanceCleanup(resource, "deleted", len(ids))

		for _, id := range ids {
			m.removeMaintenancePath("job_files", "remove_retained_log", filepath.Join(m.dataDir, "logs", "jobs", id+".log"), false)
			m.removeMaintenancePath("job_files", "remove_retained_command", filepath.Join(m.dataDir, "logs", "jobs", id+".cmd"), false)
			m.removeMaintenancePath("job_files", "remove_retained_artifact", filepath.Join(m.dataDir, "artifacts", "jobs", id+".zip"), false)
			m.removeMaintenancePath("job_files", "remove_retained_artifact_temp", filepath.Join(m.dataDir, "artifacts", "jobs", id+".zip.tmp"), false)
		}

		m.hub.Publish(ws.Event{Type: "jobs.deleted", Payload: map[string]any{"jobIds": ids, "reason": "retention"}})
	}
}

func (m *Manager) cleanupExpiredJobLogs(ctx context.Context) {
	if m.jobLogRetention <= 0 {
		return
	}
	const resource = "job_logs"
	m.metrics.AddMaintenanceCleanup(resource, "run", 1)

	logDir := filepath.Join(m.dataDir, "logs", "jobs")
	entries, err := os.ReadDir(logDir)
	if err != nil {
		m.recordMaintenanceError(resource, "read_directory", err)
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
	ids := make([]string, 0, len(jobIDs))
	for jobID := range jobIDs {
		ids = append(ids, jobID)
	}
	states, err := m.store.ListJobStatesByIDs(ctx, ids)
	if err != nil {
		m.recordMaintenanceError(resource, "list_job_states", err)
		return
	}

	cutoff := time.Now().Add(-m.jobLogRetention)
	for jobID := range jobIDs {
		select {
		case <-ctx.Done():
			return
		default:
		}
		job, ok := states[jobID]
		if !ok || job.FinishedAt == nil {
			continue
		}
		finishedAt, err := time.Parse(time.RFC3339Nano, *job.FinishedAt)
		if err != nil {
			m.recordMaintenanceError(resource, "parse_finished_at", err)
			continue
		}
		if finishedAt.After(cutoff) {
			continue
		}
		m.removeMaintenancePath(resource, "remove_log", filepath.Join(logDir, jobID+".log"), false)
		m.removeMaintenancePath(resource, "remove_command", filepath.Join(logDir, jobID+".cmd"), false)
	}
}

func (m *Manager) cleanupOrphanJobLogs(ctx context.Context) {
	const resource = "orphan_job_logs"
	m.metrics.AddMaintenanceCleanup(resource, "run", 1)
	logDir := filepath.Join(m.dataDir, "logs", "jobs")
	entries, err := os.ReadDir(logDir)
	if err != nil {
		m.recordMaintenanceError(resource, "read_directory", err)
		return
	}

	filesByJobID := make(map[string][]string)
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		jobID := ""
		switch {
		case strings.HasSuffix(name, ".log"):
			jobID = strings.TrimSuffix(name, ".log")
		case strings.HasSuffix(name, ".cmd"):
			jobID = strings.TrimSuffix(name, ".cmd")
		case strings.HasSuffix(name, ".rclone.conf"):
			jobID = strings.TrimSuffix(name, ".rclone.conf")
		default:
			continue
		}
		if jobID == "" {
			continue
		}
		filesByJobID[jobID] = append(filesByJobID[jobID], name)
	}
	ids := make([]string, 0, len(filesByJobID))
	for jobID := range filesByJobID {
		ids = append(ids, jobID)
	}
	states, err := m.store.ListJobStatesByIDs(ctx, ids)
	if err != nil {
		m.recordMaintenanceError(resource, "list_job_states", err)
		return
	}
	for jobID, names := range filesByJobID {
		state, exists := states[jobID]
		for _, name := range names {
			if exists && (!strings.HasSuffix(name, ".rclone.conf") || state.Status == models.JobStatusRunning) {
				continue
			}
			m.removeMaintenancePath(resource, "remove_file", filepath.Join(logDir, name), false)
		}
	}
}

func (m *Manager) cleanupOrphanJobArtifacts(ctx context.Context) {
	const resource = "orphan_job_artifacts"
	m.metrics.AddMaintenanceCleanup(resource, "run", 1)
	artifactDir := filepath.Join(m.dataDir, "artifacts", "jobs")
	entries, err := os.ReadDir(artifactDir)
	if err != nil {
		m.recordMaintenanceError(resource, "read_directory", err)
		return
	}

	filesByJobID := make(map[string][]string)
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

		filesByJobID[jobID] = append(filesByJobID[jobID], name)
	}
	ids := make([]string, 0, len(filesByJobID))
	for jobID := range filesByJobID {
		ids = append(ids, jobID)
	}
	states, err := m.store.ListJobStatesByIDs(ctx, ids)
	if err != nil {
		m.recordMaintenanceError(resource, "list_job_states", err)
		return
	}
	for jobID, names := range filesByJobID {
		if _, exists := states[jobID]; exists {
			continue
		}
		for _, name := range names {
			m.removeMaintenancePath(resource, "remove_file", filepath.Join(artifactDir, name), false)
		}
	}
}

func (m *Manager) cleanupOrphanStagingDirs(ctx context.Context) {
	const resource = "orphan_staging_directories"
	m.metrics.AddMaintenanceCleanup(resource, "run", 1)
	stagingDir := filepath.Join(m.dataDir, "staging")
	entries, err := os.ReadDir(stagingDir)
	if err != nil {
		m.recordMaintenanceError(resource, "read_directory", err)
		return
	}

	ids := make([]string, 0, len(entries))
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		uploadID := ent.Name()
		if uploadID == "" {
			continue
		}
		ids = append(ids, uploadID)
	}
	existing, err := m.store.ExistingUploadSessionIDs(ctx, ids)
	if err != nil {
		m.recordMaintenanceError(resource, "list_upload_sessions", err)
		return
	}
	for _, uploadID := range ids {
		if _, exists := existing[uploadID]; !exists {
			m.removeMaintenancePath(resource, "remove_directory", filepath.Join(stagingDir, uploadID), true)
		}
	}
}

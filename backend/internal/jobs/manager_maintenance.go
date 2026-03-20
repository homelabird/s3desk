package jobs

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

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
				if stagingDir, err := store.ResolveUploadStagingDir(m.dataDir, us.ID); err == nil {
					_ = os.RemoveAll(stagingDir)
				}
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

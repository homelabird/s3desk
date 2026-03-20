package jobs

import (
	"context"
	"encoding/json"
	"io"
	"time"

	"s3desk/internal/models"
)

func (m *Manager) trySetJobTotals(jobID string, objectsTotal, bytesTotal int64) {
	ot := objectsTotal
	bt := bytesTotal
	jp := &models.JobProgress{ObjectsTotal: &ot, BytesTotal: &bt}

	if err := m.persistAndPublishRunningProgress(jobID, jp); err != nil {
		m.logProgressPersistenceError(jobID, err)
	}
}

func (m *Manager) trySetJobObjectsTotal(jobID string, objectsTotal int64) {
	ot := objectsTotal
	jp := &models.JobProgress{ObjectsTotal: &ot}

	if err := m.persistAndPublishRunningProgress(jobID, jp); err != nil {
		m.logProgressPersistenceError(jobID, err)
	}
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

	if err := m.persistAndPublishRunningProgress(jobID, &jp); err != nil {
		m.logProgressPersistenceError(jobID, err)
	}
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

	if err := m.persistAndPublishRunningProgress(jobID, jp); err != nil {
		m.logProgressPersistenceError(jobID, err)
	}
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

package jobs

import (
	"context"
	"encoding/json"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/processio"
)

func (m *Manager) trySetJobTotals(jobID string, objectsTotal, bytesTotal int64) *models.JobProgress {
	ot := objectsTotal
	bt := bytesTotal
	jp := &models.JobProgress{ObjectsTotal: &ot, BytesTotal: &bt}

	if err := m.persistAndPublishRunningProgress(jobID, jp); err != nil {
		m.logProgressPersistenceError(jobID, err)
	}
	return jp
}

func (m *Manager) trySetJobObjectsTotal(jobID string, objectsTotal int64) *models.JobProgress {
	ot := objectsTotal
	jp := &models.JobProgress{ObjectsTotal: &ot}

	if err := m.persistAndPublishRunningProgress(jobID, jp); err != nil {
		m.logProgressPersistenceError(jobID, err)
	}
	return jp
}

func (m *Manager) trySetJobTotalsFromS3Object(ctx context.Context, profileID, jobID, bucket, key string, preserveLeadingSlash bool) *models.JobProgress {
	key = normalizeKeyInput(key, preserveLeadingSlash)

	profileSecrets, ok, err := m.profileSecrets(ctx, profileID)
	if err != nil || !ok {
		return nil
	}

	headCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	proc, err := m.startRcloneCommand(headCtx, profileSecrets, jobID, []string{"lsjson", "--stat", "--no-mimetype", rcloneRemoteObject(bucket, key, preserveLeadingSlash)})
	if err != nil {
		return nil
	}
	out, readErr := processio.ReadAll(proc.stdout, rcloneCaptureStdoutMaxBytes, "rclone stdout")
	waitErr := proc.wait()
	if readErr != nil || waitErr != nil {
		return nil
	}
	if len(out) == 0 {
		return nil
	}

	var entry rcloneListEntry
	if err := json.Unmarshal(out, &entry); err != nil {
		return nil
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
	return jp
}

func (m *Manager) trySetJobTotalsFromS3Prefix(ctx context.Context, profileID, jobID, bucket, prefix string, include, exclude []string, preserveLeadingSlash bool) *models.JobProgress {
	profileSecrets, ok, err := m.profileSecrets(ctx, profileID)
	if err != nil || !ok {
		return nil
	}

	totals, ok, err := computeS3PrefixTotals(ctx, m, profileSecrets, jobID, bucket, prefix, include, exclude, 0, preserveLeadingSlash)
	if err != nil || !ok {
		return nil
	}

	return m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
}

func (m *Manager) trySetJobObjectsTotalFromS3Prefix(ctx context.Context, profileID, jobID, bucket, prefix string, include, exclude []string, preserveLeadingSlash bool) *models.JobProgress {
	profileSecrets, ok, err := m.profileSecrets(ctx, profileID)
	if err != nil || !ok {
		return nil
	}

	totals, ok, err := computeS3PrefixTotals(ctx, m, profileSecrets, jobID, bucket, prefix, include, exclude, 0, preserveLeadingSlash)
	if err != nil || !ok {
		return nil
	}

	return m.trySetJobObjectsTotal(jobID, totals.Objects)
}

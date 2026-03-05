package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"

	"s3desk/internal/models"
)

type CreateJobInput struct {
	Type    string
	Payload map[string]any
}

func (s *Store) CreateJob(ctx context.Context, profileID string, in CreateJobInput) (models.Job, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	payloadJSON, err := json.Marshal(in.Payload)
	if err != nil {
		return models.Job{}, err
	}

	row := jobRow{
		ID:          id,
		ProfileID:   profileID,
		Type:        in.Type,
		Status:      string(models.JobStatusQueued),
		PayloadJSON: string(payloadJSON),
		CreatedAt:   now,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return models.Job{}, err
	}

	return models.Job{
		ID:        id,
		Type:      in.Type,
		Status:    models.JobStatusQueued,
		Payload:   in.Payload,
		CreatedAt: now,
	}, nil
}

type JobFilter struct {
	Status    *models.JobStatus
	Type      *string
	ErrorCode *string
	Limit     int
	Cursor    *string
}

func (s *Store) ListJobs(ctx context.Context, profileID string, f JobFilter) (models.JobsListResponse, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("profile_id = ?", profileID)
	if f.Status != nil {
		query = query.Where("status = ?", string(*f.Status))
	}
	if f.Type != nil && *f.Type != "" {
		query = query.Where("type = ?", *f.Type)
	}
	if f.ErrorCode != nil {
		code := strings.TrimSpace(*f.ErrorCode)
		if code != "" {
			query = query.Where("error_code = ?", code)
		}
	}
	if f.Cursor != nil && *f.Cursor != "" {
		query = query.Where("id < ?", *f.Cursor)
	}

	resp := models.JobsListResponse{
		Items: make([]models.Job, 0),
	}
	var (
		jobIDs   []string
		jobCount int
	)
	var rows []jobRow
	if err := query.
		Order("id DESC").
		Limit(limit + 1).
		Find(&rows).Error; err != nil {
		return models.JobsListResponse{}, err
	}

	for _, row := range rows {
		job, err := jobFromRow(row)
		if err != nil {
			continue
		}

		jobCount++
		if jobCount <= limit {
			resp.Items = append(resp.Items, job)
			jobIDs = append(jobIDs, job.ID)
		}
	}

	if len(jobIDs) == limit && jobCount > limit {
		last := jobIDs[len(jobIDs)-1]
		resp.NextCursor = &last
	}
	return resp, nil
}

func (s *Store) GetJob(ctx context.Context, profileID, jobID string) (models.Job, bool, error) {
	var row jobRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, jobID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.Job{}, false, nil
		}
		return models.Job{}, false, err
	}

	job, err := jobFromRow(row)
	if err != nil {
		return models.Job{}, false, err
	}
	return job, true, nil
}

func (s *Store) DeleteJob(ctx context.Context, profileID, jobID string) (bool, error) {
	res := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, jobID).
		Delete(&jobRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (s *Store) DeleteFinishedJobsBefore(ctx context.Context, beforeRFC3339Nano string, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 1000 {
		limit = 1000
	}

	ids := make([]string, 0, limit)
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("finished_at IS NOT NULL").
		Where("finished_at < ?", beforeRFC3339Nano).
		Where("status IN ?", []string{
			string(models.JobStatusSucceeded),
			string(models.JobStatusFailed),
			string(models.JobStatusCanceled),
		}).
		Order("finished_at ASC").
		Limit(limit).
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}

	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return tx.Where("id IN ?", ids).Delete(&jobRow{}).Error
	}); err != nil {
		return nil, err
	}

	return ids, nil
}

func (s *Store) ListJobIDsByProfile(ctx context.Context, profileID string) ([]string, error) {
	var ids []string
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("profile_id = ?", profileID).
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) ListJobIDsByProfileAndStatus(ctx context.Context, profileID string, status models.JobStatus) ([]string, error) {
	var ids []string
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("profile_id = ? AND status = ?", profileID, string(status)).
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) JobExists(ctx context.Context, jobID string) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("id = ?", jobID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Store) GetJobByID(ctx context.Context, jobID string) (profileID string, job models.Job, ok bool, err error) {
	var row jobRow
	if err := s.db.WithContext(ctx).
		Where("id = ?", jobID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", models.Job{}, false, nil
		}
		return "", models.Job{}, false, err
	}

	job, err = jobFromRow(row)
	if err != nil {
		return "", models.Job{}, false, err
	}
	return row.ProfileID, job, true, nil
}

func (s *Store) UpdateJobStatus(ctx context.Context, jobID string, status models.JobStatus, startedAt, finishedAt *string, progress *models.JobProgress, errMsg *string, errorCode *string) error {
	var progressJSON *string
	if progress != nil {
		bytes, err := json.Marshal(progress)
		if err != nil {
			return err
		}
		val := string(bytes)
		progressJSON = &val
	}

	updates := map[string]any{
		"status":     string(status),
		"error":      errMsg,
		"error_code": errorCode,
	}
	if startedAt != nil {
		updates["started_at"] = *startedAt
	}
	if finishedAt != nil {
		updates["finished_at"] = *finishedAt
	}
	if progressJSON != nil {
		updates["progress_json"] = *progressJSON
	}

	return s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("id = ?", jobID).
		Updates(updates).Error
}

func (s *Store) ListJobIDsByStatus(ctx context.Context, status models.JobStatus) ([]string, error) {
	var ids []string
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("status = ?", string(status)).
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) MarkRunningJobsFailed(ctx context.Context, errorMessage string) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	updates := map[string]any{
		"status":      string(models.JobStatusFailed),
		"error":       errorMessage,
		"finished_at": now,
	}
	return s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("status = ?", string(models.JobStatusRunning)).
		Updates(updates).Error
}

func jobFromRow(row jobRow) (models.Job, error) {
	job := models.Job{
		ID:        row.ID,
		Type:      row.Type,
		Status:    models.JobStatus(row.Status),
		Payload:   make(map[string]any),
		CreatedAt: row.CreatedAt,
	}
	if err := json.Unmarshal([]byte(row.PayloadJSON), &job.Payload); err != nil {
		return models.Job{}, err
	}
	if row.ProgressJSON != nil && *row.ProgressJSON != "" {
		var jp models.JobProgress
		if err := json.Unmarshal([]byte(*row.ProgressJSON), &jp); err != nil {
			return models.Job{}, err
		}
		job.Progress = &jp
	}
	if row.Error != nil {
		job.Error = row.Error
	}
	if row.ErrorCode != nil {
		job.ErrorCode = row.ErrorCode
	}
	if row.StartedAt != nil {
		job.StartedAt = row.StartedAt
	}
	if row.FinishedAt != nil {
		job.FinishedAt = row.FinishedAt
	}
	return job, nil
}

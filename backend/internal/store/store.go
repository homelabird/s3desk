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

type Store struct {
	db     *gorm.DB
	crypto *profileCrypto
}

type Options struct {
	EncryptionKey string
}

func New(sqlDB *gorm.DB, opts Options) (*Store, error) {
	pc, err := newProfileCrypto(opts.EncryptionKey)
	if err != nil {
		return nil, err
	}
	return &Store{db: sqlDB, crypto: pc}, nil
}

func (s *Store) CreateProfile(ctx context.Context, req models.ProfileCreateRequest) (models.Profile, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	accessKeyID := req.AccessKeyID
	secretAccessKey := req.SecretAccessKey
	var sessionToken *string
	if req.SessionToken != nil {
		v := strings.TrimSpace(*req.SessionToken)
		if v != "" {
			sessionToken = &v
		}
	}

	if s.crypto != nil {
		var err error
		accessKeyID, err = s.crypto.encryptString(accessKeyID)
		if err != nil {
			return models.Profile{}, err
		}
		secretAccessKey, err = s.crypto.encryptString(secretAccessKey)
		if err != nil {
			return models.Profile{}, err
		}
		if sessionToken != nil {
			enc, err := s.crypto.encryptString(*sessionToken)
			if err != nil {
				return models.Profile{}, err
			}
			*sessionToken = enc
		}
	}

	row := profileRow{
		ID:                    id,
		Name:                  req.Name,
		Endpoint:              req.Endpoint,
		Region:                req.Region,
		ForcePathStyle:        boolToInt(req.ForcePathStyle),
		PreserveLeadingSlash:  boolToInt(req.PreserveLeadingSlash),
		TLSInsecureSkipVerify: boolToInt(req.TLSInsecureSkipVerify),
		AccessKeyID:           accessKeyID,
		SecretAccessKey:       secretAccessKey,
		SessionToken:          sessionToken,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return models.Profile{}, err
	}

	return models.Profile{
		ID:                    id,
		Name:                  req.Name,
		Endpoint:              req.Endpoint,
		Region:                req.Region,
		ForcePathStyle:        req.ForcePathStyle,
		PreserveLeadingSlash:  req.PreserveLeadingSlash,
		TLSInsecureSkipVerify: req.TLSInsecureSkipVerify,
		CreatedAt:             now,
		UpdatedAt:             now,
	}, nil
}

func (s *Store) EnsureProfilesEncrypted(ctx context.Context) (updated int, err error) {
	if s.crypto == nil {
		return 0, nil
	}

	var profiles []profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "access_key_id", "secret_access_key", "session_token").
		Find(&profiles).Error; err != nil {
		return 0, err
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, p := range profiles {
		ak := p.AccessKeyID
		sk := p.SecretAccessKey
		session := p.SessionToken

		needsUpdate := false

		if !strings.HasPrefix(ak, encryptedPrefix) {
			enc, err := s.crypto.encryptString(ak)
			if err != nil {
				return updated, err
			}
			ak = enc
			needsUpdate = true
		}
		if !strings.HasPrefix(sk, encryptedPrefix) {
			enc, err := s.crypto.encryptString(sk)
			if err != nil {
				return updated, err
			}
			sk = enc
			needsUpdate = true
		}
		if session != nil && *session != "" && !strings.HasPrefix(*session, encryptedPrefix) {
			enc, err := s.crypto.encryptString(*session)
			if err != nil {
				return updated, err
			}
			*session = enc
			needsUpdate = true
		}

		if !needsUpdate {
			continue
		}
		updates := map[string]any{
			"access_key_id":     ak,
			"secret_access_key": sk,
			"session_token":     session,
			"updated_at":        now,
		}
		if err := s.db.WithContext(ctx).
			Model(&profileRow{}).
			Where("id = ?", p.ID).
			Updates(updates).Error; err != nil {
			return updated, err
		}
		updated++
	}

	return updated, nil
}

func (s *Store) ListProfiles(ctx context.Context) ([]models.Profile, error) {
	var rows []profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "name", "endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "created_at", "updated_at").
		Order("created_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]models.Profile, 0, len(rows))
	for _, row := range rows {
		out = append(out, models.Profile{
			ID:                    row.ID,
			Name:                  row.Name,
			Endpoint:              row.Endpoint,
			Region:                row.Region,
			ForcePathStyle:        row.ForcePathStyle != 0,
			PreserveLeadingSlash:  row.PreserveLeadingSlash != 0,
			TLSInsecureSkipVerify: row.TLSInsecureSkipVerify != 0,
			CreatedAt:             row.CreatedAt,
			UpdatedAt:             row.UpdatedAt,
		})
	}
	return out, nil
}

func (s *Store) GetProfile(ctx context.Context, profileID string) (models.Profile, bool, error) {
	var row profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "name", "endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "created_at", "updated_at").
		Where("id = ?", profileID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.Profile{}, false, nil
		}
		return models.Profile{}, false, err
	}
	profile := models.Profile{
		ID:                    row.ID,
		Name:                  row.Name,
		Endpoint:              row.Endpoint,
		Region:                row.Region,
		ForcePathStyle:        row.ForcePathStyle != 0,
		PreserveLeadingSlash:  row.PreserveLeadingSlash != 0,
		TLSInsecureSkipVerify: row.TLSInsecureSkipVerify != 0,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
	return profile, true, nil
}

func (s *Store) GetProfileSecrets(ctx context.Context, profileID string) (models.ProfileSecrets, bool, error) {
	var row profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "name", "endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "access_key_id", "secret_access_key", "session_token").
		Where("id = ?", profileID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ProfileSecrets{}, false, nil
		}
		return models.ProfileSecrets{}, false, err
	}

	profile := models.ProfileSecrets{
		ID:                    row.ID,
		Name:                  row.Name,
		Endpoint:              row.Endpoint,
		Region:                row.Region,
		ForcePathStyle:        row.ForcePathStyle != 0,
		PreserveLeadingSlash:  row.PreserveLeadingSlash != 0,
		TLSInsecureSkipVerify: row.TLSInsecureSkipVerify != 0,
		AccessKeyID:           row.AccessKeyID,
		SecretAccessKey:       row.SecretAccessKey,
	}

	if strings.HasPrefix(profile.AccessKeyID, encryptedPrefix) ||
		strings.HasPrefix(profile.SecretAccessKey, encryptedPrefix) ||
		(row.SessionToken != nil && strings.HasPrefix(*row.SessionToken, encryptedPrefix)) {
		if s.crypto == nil {
			return models.ProfileSecrets{}, false, ErrEncryptedCredentials
		}
		var err error
		profile.AccessKeyID, err = s.crypto.decryptString(profile.AccessKeyID)
		if err != nil {
			return models.ProfileSecrets{}, false, err
		}
		profile.SecretAccessKey, err = s.crypto.decryptString(profile.SecretAccessKey)
		if err != nil {
			return models.ProfileSecrets{}, false, err
		}
		if row.SessionToken != nil {
			dec, err := s.crypto.decryptString(*row.SessionToken)
			if err != nil {
				return models.ProfileSecrets{}, false, err
			}
			row.SessionToken = &dec
		}
	}

	if row.SessionToken != nil {
		profile.SessionToken = row.SessionToken
	}

	tlsCfg, updatedAt, found, err := s.GetProfileTLSConfig(ctx, profileID)
	if err != nil {
		return models.ProfileSecrets{}, false, err
	}
	if found {
		profile.TLSConfig = &tlsCfg
		profile.TLSConfigUpdatedAt = updatedAt
	}
	return profile, true, nil
}

func (s *Store) UpdateProfile(ctx context.Context, profileID string, req models.ProfileUpdateRequest) (models.Profile, bool, error) {
	currentSecrets, ok, err := s.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return models.Profile{}, ok, err
	}

	name := currentSecrets.Name
	endpoint := currentSecrets.Endpoint
	region := currentSecrets.Region
	accessKeyID := currentSecrets.AccessKeyID
	secretAccessKey := currentSecrets.SecretAccessKey
	sessionToken := currentSecrets.SessionToken
	forcePathStyle := currentSecrets.ForcePathStyle
	preserveLeadingSlash := currentSecrets.PreserveLeadingSlash
	tlsInsecureSkipVerify := currentSecrets.TLSInsecureSkipVerify

	if req.Name != nil {
		name = *req.Name
	}
	if req.Endpoint != nil {
		endpoint = *req.Endpoint
	}
	if req.Region != nil {
		region = *req.Region
	}
	if req.AccessKeyID != nil {
		accessKeyID = *req.AccessKeyID
	}
	if req.SecretAccessKey != nil {
		secretAccessKey = *req.SecretAccessKey
	}
	if req.SessionToken != nil {
		v := strings.TrimSpace(*req.SessionToken)
		if v == "" {
			sessionToken = nil
		} else {
			sessionToken = &v
		}
	}
	if req.ForcePathStyle != nil {
		forcePathStyle = *req.ForcePathStyle
	}
	if req.PreserveLeadingSlash != nil {
		preserveLeadingSlash = *req.PreserveLeadingSlash
	}
	if req.TLSInsecureSkipVerify != nil {
		tlsInsecureSkipVerify = *req.TLSInsecureSkipVerify
	}

	if s.crypto != nil {
		var err error
		accessKeyID, err = s.crypto.encryptString(accessKeyID)
		if err != nil {
			return models.Profile{}, true, err
		}
		secretAccessKey, err = s.crypto.encryptString(secretAccessKey)
		if err != nil {
			return models.Profile{}, true, err
		}
		if sessionToken != nil {
			enc, err := s.crypto.encryptString(*sessionToken)
			if err != nil {
				return models.Profile{}, true, err
			}
			*sessionToken = enc
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	updates := map[string]any{
		"name":                     name,
		"endpoint":                 endpoint,
		"region":                   region,
		"force_path_style":         boolToInt(forcePathStyle),
		"preserve_leading_slash":   boolToInt(preserveLeadingSlash),
		"tls_insecure_skip_verify": boolToInt(tlsInsecureSkipVerify),
		"access_key_id":            accessKeyID,
		"secret_access_key":        secretAccessKey,
		"session_token":            sessionToken,
		"updated_at":               now,
	}
	if err := s.db.WithContext(ctx).
		Model(&profileRow{}).
		Where("id = ?", profileID).
		Updates(updates).Error; err != nil {
		return models.Profile{}, true, err
	}

	profile, ok, err := s.GetProfile(ctx, profileID)
	if err != nil || !ok {
		return models.Profile{}, ok, err
	}
	return profile, true, nil
}

func (s *Store) DeleteProfile(ctx context.Context, profileID string) (bool, error) {
	res := s.db.WithContext(ctx).
		Where("id = ?", profileID).
		Delete(&profileRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

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
	Status *models.JobStatus
	Type   *string
	Limit  int
	Cursor *string
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
		job := models.Job{
			ID:        row.ID,
			Type:      row.Type,
			Status:    models.JobStatus(row.Status),
			Payload:   make(map[string]any),
			CreatedAt: row.CreatedAt,
		}
		if err := json.Unmarshal([]byte(row.PayloadJSON), &job.Payload); err != nil {
			return models.JobsListResponse{}, err
		}
		if row.ProgressJSON != nil && *row.ProgressJSON != "" {
			var jp models.JobProgress
			if err := json.Unmarshal([]byte(*row.ProgressJSON), &jp); err != nil {
				return models.JobsListResponse{}, err
			}
			job.Progress = &jp
		}
		if row.Error != nil {
			job.Error = row.Error
		}
		if row.StartedAt != nil {
			job.StartedAt = row.StartedAt
		}
		if row.FinishedAt != nil {
			job.FinishedAt = row.FinishedAt
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

	job := models.Job{
		ID:        row.ID,
		Type:      row.Type,
		Status:    models.JobStatus(row.Status),
		Payload:   make(map[string]any),
		CreatedAt: row.CreatedAt,
	}
	if err := json.Unmarshal([]byte(row.PayloadJSON), &job.Payload); err != nil {
		return models.Job{}, false, err
	}
	if row.ProgressJSON != nil && *row.ProgressJSON != "" {
		var jp models.JobProgress
		if err := json.Unmarshal([]byte(*row.ProgressJSON), &jp); err != nil {
			return models.Job{}, false, err
		}
		job.Progress = &jp
	}
	if row.Error != nil {
		job.Error = row.Error
	}
	if row.StartedAt != nil {
		job.StartedAt = row.StartedAt
	}
	if row.FinishedAt != nil {
		job.FinishedAt = row.FinishedAt
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

	profileID = row.ProfileID
	job = models.Job{
		ID:        row.ID,
		Type:      row.Type,
		Status:    models.JobStatus(row.Status),
		Payload:   make(map[string]any),
		CreatedAt: row.CreatedAt,
	}
	if err := json.Unmarshal([]byte(row.PayloadJSON), &job.Payload); err != nil {
		return "", models.Job{}, false, err
	}
	if row.ProgressJSON != nil && *row.ProgressJSON != "" {
		var jp models.JobProgress
		if err := json.Unmarshal([]byte(*row.ProgressJSON), &jp); err != nil {
			return "", models.Job{}, false, err
		}
		job.Progress = &jp
	}
	if row.Error != nil {
		job.Error = row.Error
	}
	if row.StartedAt != nil {
		job.StartedAt = row.StartedAt
	}
	if row.FinishedAt != nil {
		job.FinishedAt = row.FinishedAt
	}

	return profileID, job, true, nil
}

func (s *Store) UpdateJobStatus(ctx context.Context, jobID string, status models.JobStatus, startedAt, finishedAt *string, progress *models.JobProgress, errMsg *string) error {
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
		"status": string(status),
		"error":  errMsg,
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

type UploadSession struct {
	ID         string
	ProfileID  string
	Bucket     string
	Prefix     string
	StagingDir string
	ExpiresAt  string
	CreatedAt  string
}

func (s *Store) CreateUploadSession(ctx context.Context, profileID, bucket, prefix, stagingDir, expiresAt string) (UploadSession, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	row := uploadSessionRow{
		ID:         id,
		ProfileID:  profileID,
		Bucket:     bucket,
		Prefix:     prefix,
		StagingDir: stagingDir,
		ExpiresAt:  expiresAt,
		CreatedAt:  now,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return UploadSession{}, err
	}
	return UploadSession{
		ID:         id,
		ProfileID:  profileID,
		Bucket:     bucket,
		Prefix:     prefix,
		StagingDir: stagingDir,
		ExpiresAt:  expiresAt,
		CreatedAt:  now,
	}, nil
}

func (s *Store) SetUploadSessionStagingDir(ctx context.Context, profileID, uploadID, stagingDir string) error {
	return s.db.WithContext(ctx).
		Model(&uploadSessionRow{}).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		Update("staging_dir", stagingDir).Error
}

func (s *Store) GetUploadSession(ctx context.Context, profileID, uploadID string) (UploadSession, bool, error) {
	var row uploadSessionRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return UploadSession{}, false, nil
		}
		return UploadSession{}, false, err
	}
	return UploadSession{
		ID:         row.ID,
		ProfileID:  row.ProfileID,
		Bucket:     row.Bucket,
		Prefix:     row.Prefix,
		StagingDir: row.StagingDir,
		ExpiresAt:  row.ExpiresAt,
		CreatedAt:  row.CreatedAt,
	}, true, nil
}

func (s *Store) UploadSessionExists(ctx context.Context, uploadID string) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&uploadSessionRow{}).
		Where("id = ?", uploadID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Store) ListUploadSessionsByProfile(ctx context.Context, profileID string, limit int) ([]UploadSession, error) {
	if limit <= 0 {
		limit = 1000
	}
	if limit > 10_000 {
		limit = 10_000
	}

	var rows []uploadSessionRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ?", profileID).
		Order("created_at ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	sessions := make([]UploadSession, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, UploadSession{
			ID:         row.ID,
			ProfileID:  row.ProfileID,
			Bucket:     row.Bucket,
			Prefix:     row.Prefix,
			StagingDir: row.StagingDir,
			ExpiresAt:  row.ExpiresAt,
			CreatedAt:  row.CreatedAt,
		})
	}
	return sessions, nil
}

func (s *Store) DeleteUploadSession(ctx context.Context, profileID, uploadID string) (bool, error) {
	res := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		Delete(&uploadSessionRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (s *Store) ListExpiredUploadSessions(ctx context.Context, nowRFC3339Nano string, limit int) ([]UploadSession, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	var rows []uploadSessionRow
	if err := s.db.WithContext(ctx).
		Where("expires_at < ?", nowRFC3339Nano).
		Order("expires_at ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	sessions := make([]UploadSession, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, UploadSession{
			ID:         row.ID,
			ProfileID:  row.ProfileID,
			Bucket:     row.Bucket,
			Prefix:     row.Prefix,
			StagingDir: row.StagingDir,
			ExpiresAt:  row.ExpiresAt,
			CreatedAt:  row.CreatedAt,
		})
	}
	return sessions, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

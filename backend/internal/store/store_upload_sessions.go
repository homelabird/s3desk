package store

import (
	"context"
	"errors"
	"time"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UploadSession struct {
	ID         string
	ProfileID  string
	Bucket     string
	Prefix     string
	Mode       string
	StagingDir string
	Bytes      int64
	ExpiresAt  string
	CreatedAt  string
}

type MultipartUpload struct {
	UploadID   string
	ProfileID  string
	Path       string
	Bucket     string
	ObjectKey  string
	S3UploadID string
	ChunkSize  int64
	FileSize   int64
	CreatedAt  string
	UpdatedAt  string
}

func (s *Store) CreateUploadSession(ctx context.Context, profileID, bucket, prefix, mode, stagingDir, expiresAt string) (UploadSession, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	row := uploadSessionRow{
		ID:         id,
		ProfileID:  profileID,
		Bucket:     bucket,
		Prefix:     prefix,
		Mode:       mode,
		StagingDir: stagingDir,
		Bytes:      0,
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
		Mode:       mode,
		StagingDir: stagingDir,
		Bytes:      0,
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
	return UploadSession(row), true, nil
}

func (s *Store) AddUploadSessionBytes(ctx context.Context, profileID, uploadID string, delta int64) error {
	if delta == 0 {
		return nil
	}
	return s.db.WithContext(ctx).
		Model(&uploadSessionRow{}).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		UpdateColumn("bytes_tracked", gorm.Expr("bytes_tracked + ?", delta)).Error
}

func (s *Store) GetMultipartUpload(ctx context.Context, profileID, uploadID, path string) (MultipartUpload, bool, error) {
	var row uploadMultipartRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ? AND path = ?", profileID, uploadID, path).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return MultipartUpload{}, false, nil
		}
		return MultipartUpload{}, false, err
	}
	return MultipartUpload(row), true, nil
}

func (s *Store) UpsertMultipartUpload(ctx context.Context, mu MultipartUpload) error {
	row := uploadMultipartRow(mu)
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "upload_id"}, {Name: "path"}},
		DoUpdates: clause.AssignmentColumns([]string{"bucket", "object_key", "s3_upload_id", "chunk_size", "file_size", "updated_at"}),
	}).Create(&row).Error
}

func (s *Store) ListMultipartUploads(ctx context.Context, profileID, uploadID string) ([]MultipartUpload, error) {
	var rows []uploadMultipartRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ?", profileID, uploadID).
		Order("path ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]MultipartUpload, 0, len(rows))
	for _, row := range rows {
		out = append(out, MultipartUpload(row))
	}
	return out, nil
}

func (s *Store) DeleteMultipartUpload(ctx context.Context, profileID, uploadID, path string) error {
	return s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ? AND path = ?", profileID, uploadID, path).
		Delete(&uploadMultipartRow{}).Error
}

func (s *Store) DeleteMultipartUploadsBySession(ctx context.Context, profileID, uploadID string) error {
	return s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ?", profileID, uploadID).
		Delete(&uploadMultipartRow{}).Error
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
		sessions = append(sessions, UploadSession(row))
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
		sessions = append(sessions, UploadSession(row))
	}
	return sessions, nil
}

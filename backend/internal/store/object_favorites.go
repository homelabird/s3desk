package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm/clause"

	"object-storage/internal/models"
)

func (s *Store) ListObjectFavorites(ctx context.Context, profileID, bucket string) ([]models.ObjectFavorite, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, errors.New("bucket is required")
	}

	var rows []objectFavoriteRow
	if err := s.db.WithContext(ctx).
		Select("object_key", "created_at").
		Where("profile_id = ? AND bucket = ?", profileID, bucket).
		Order("created_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]models.ObjectFavorite, 0, len(rows))
	for _, row := range rows {
		out = append(out, models.ObjectFavorite{Key: row.ObjectKey, CreatedAt: row.CreatedAt})
	}
	return out, nil
}

func (s *Store) AddObjectFavorite(ctx context.Context, profileID, bucket, key string) (models.ObjectFavorite, error) {
	bucket = strings.TrimSpace(bucket)
	key = strings.TrimSpace(key)
	if bucket == "" {
		return models.ObjectFavorite{}, errors.New("bucket is required")
	}
	if key == "" {
		return models.ObjectFavorite{}, errors.New("key is required")
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	row := objectFavoriteRow{
		ProfileID: profileID,
		Bucket:    bucket,
		ObjectKey: key,
		CreatedAt: now,
	}
	if err := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "profile_id"}, {Name: "bucket"}, {Name: "object_key"}},
			DoNothing: true,
		}).
		Create(&row).Error; err != nil {
		return models.ObjectFavorite{}, err
	}

	var fetched objectFavoriteRow
	if err := s.db.WithContext(ctx).
		Select("created_at").
		Where("profile_id = ? AND bucket = ? AND object_key = ?", profileID, bucket, key).
		Take(&fetched).Error; err != nil {
		return models.ObjectFavorite{}, err
	}

	return models.ObjectFavorite{Key: key, CreatedAt: fetched.CreatedAt}, nil
}

func (s *Store) DeleteObjectFavorite(ctx context.Context, profileID, bucket, key string) (bool, error) {
	bucket = strings.TrimSpace(bucket)
	key = strings.TrimSpace(key)
	if bucket == "" {
		return false, errors.New("bucket is required")
	}
	if key == "" {
		return false, errors.New("key is required")
	}

	res := s.db.WithContext(ctx).
		Where("profile_id = ? AND bucket = ? AND object_key = ?", profileID, bucket, key).
		Delete(&objectFavoriteRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

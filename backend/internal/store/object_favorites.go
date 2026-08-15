package store

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm/clause"

	"s3desk/internal/models"
)

var ErrInvalidObjectFavoriteCursor = errors.New("invalid object favorite cursor")

type ObjectFavoritesFilter struct {
	Prefix string
	Limit  int
	Cursor string
}

func (s *Store) ListObjectFavorites(ctx context.Context, profileID, bucket string, filter ObjectFavoritesFilter) ([]models.ObjectFavorite, *string, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, nil, errors.New("bucket is required")
	}
	filter.Prefix = strings.TrimSpace(filter.Prefix)
	limit := filter.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 200 {
		limit = 200
	}

	var rows []objectFavoriteRow
	query := s.db.WithContext(ctx).
		Select("object_key", "created_at").
		Where("profile_id = ? AND bucket = ?", profileID, bucket)
	if filter.Prefix != "" {
		query = query.Where(`object_key LIKE ? ESCAPE '\'`, escapeLike(filter.Prefix)+"%")
	}
	if filter.Cursor != "" {
		createdAt, objectKey, err := decodeObjectFavoriteCursor(filter.Cursor)
		if err != nil {
			return nil, nil, err
		}
		query = query.Where("created_at < ? OR (created_at = ? AND object_key > ?)", createdAt, createdAt, objectKey)
	}
	if err := query.
		Order("created_at DESC, object_key ASC").
		Limit(limit + 1).
		Find(&rows).Error; err != nil {
		return nil, nil, err
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	out := make([]models.ObjectFavorite, 0, len(rows))
	for _, row := range rows {
		out = append(out, models.ObjectFavorite{Key: row.ObjectKey, CreatedAt: row.CreatedAt})
	}
	if !hasMore || len(rows) == 0 {
		return out, nil, nil
	}
	cursor := encodeObjectFavoriteCursor(rows[len(rows)-1].CreatedAt, rows[len(rows)-1].ObjectKey)
	return out, &cursor, nil
}

func encodeObjectFavoriteCursor(createdAt, objectKey string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(createdAt + "\n" + objectKey))
}

func decodeObjectFavoriteCursor(cursor string) (string, string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(cursor))
	if err != nil {
		return "", "", ErrInvalidObjectFavoriteCursor
	}
	createdAt, objectKey, ok := strings.Cut(string(decoded), "\n")
	if !ok || createdAt == "" || objectKey == "" {
		return "", "", ErrInvalidObjectFavoriteCursor
	}
	return createdAt, objectKey, nil
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
	res := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "profile_id"}, {Name: "bucket"}, {Name: "object_key"}},
			DoNothing: true,
		}).
		Create(&row)
	if res.Error != nil {
		return models.ObjectFavorite{}, res.Error
	}

	// Fresh insert – we already know created_at; skip the extra SELECT.
	if res.RowsAffected > 0 {
		return models.ObjectFavorite{Key: key, CreatedAt: now}, nil
	}

	// Conflict (already exists) – fetch the original created_at.
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

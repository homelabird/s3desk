package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"object-storage/internal/models"
)

func (s *Store) ListObjectFavorites(ctx context.Context, profileID, bucket string) ([]models.ObjectFavorite, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, errors.New("bucket is required")
	}

	rows, err := s.query(ctx, `
		SELECT object_key, created_at
		FROM object_favorites
		WHERE profile_id = ? AND bucket = ?
		ORDER BY created_at DESC
	`, profileID, bucket)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.ObjectFavorite, 0)
	for rows.Next() {
		var key, createdAt string
		if err := rows.Scan(&key, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, models.ObjectFavorite{Key: key, CreatedAt: createdAt})
	}
	if err := rows.Err(); err != nil {
		return nil, err
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
	if _, err := s.exec(ctx, `
		INSERT INTO object_favorites (profile_id, bucket, object_key, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(profile_id, bucket, object_key) DO NOTHING
	`, profileID, bucket, key, now); err != nil {
		return models.ObjectFavorite{}, err
	}

	var createdAt string
	if err := s.queryRow(ctx, `
		SELECT created_at FROM object_favorites WHERE profile_id = ? AND bucket = ? AND object_key = ?
	`, profileID, bucket, key).Scan(&createdAt); err != nil {
		return models.ObjectFavorite{}, err
	}

	return models.ObjectFavorite{Key: key, CreatedAt: createdAt}, nil
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

	affected, err := s.exec(ctx, `
		DELETE FROM object_favorites WHERE profile_id = ? AND bucket = ? AND object_key = ?
	`, profileID, bucket, key)
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

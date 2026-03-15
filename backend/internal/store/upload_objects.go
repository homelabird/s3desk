package store

import (
	"context"
	"time"

	"gorm.io/gorm/clause"
)

type UploadObject struct {
	UploadID     string
	ProfileID    string
	Path         string
	Bucket       string
	ObjectKey    string
	ExpectedSize *int64
	CreatedAt    string
	UpdatedAt    string
}

func (s *Store) UpsertUploadObject(ctx context.Context, obj UploadObject) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if obj.CreatedAt == "" {
		obj.CreatedAt = now
	}
	if obj.UpdatedAt == "" {
		obj.UpdatedAt = now
	}

	row := uploadObjectRow(obj)
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "upload_id"},
			{Name: "path"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"bucket", "object_key", "expected_size", "updated_at"}),
	}).Create(&row).Error
}

func (s *Store) ListUploadObjects(ctx context.Context, profileID, uploadID string) ([]UploadObject, error) {
	var rows []uploadObjectRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ?", profileID, uploadID).
		Order("path ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	objects := make([]UploadObject, 0, len(rows))
	for _, row := range rows {
		objects = append(objects, UploadObject(row))
	}
	return objects, nil
}

func (s *Store) DeleteUploadObjectsBySession(ctx context.Context, profileID, uploadID string) error {
	return s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ?", profileID, uploadID).
		Delete(&uploadObjectRow{}).Error
}

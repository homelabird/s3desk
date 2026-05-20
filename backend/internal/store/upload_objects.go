package store

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrUploadSessionBytesExceeded = errors.New("upload session bytes limit exceeded")
	ErrUploadSessionNotFound      = errors.New("upload session not found")
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

type UploadObjectReservation struct {
	UploadID  string
	ProfileID string
	Path      string
	Previous  *UploadObject
	Delta     int64
}

func (s *Store) UpsertUploadObject(ctx context.Context, obj UploadObject) error {
	return upsertUploadObject(s.db.WithContext(ctx), obj)
}

func (s *Store) UpsertUploadObjectWithByteLimit(ctx context.Context, obj UploadObject, maxBytes int64) error {
	_, err := s.UpsertUploadObjectWithByteLimitReservation(ctx, obj, maxBytes)
	return err
}

func (s *Store) UpsertUploadObjectWithByteLimitReservation(ctx context.Context, obj UploadObject, maxBytes int64) (UploadObjectReservation, error) {
	if obj.ExpectedSize == nil {
		return UploadObjectReservation{
			UploadID:  obj.UploadID,
			ProfileID: obj.ProfileID,
			Path:      obj.Path,
		}, s.UpsertUploadObject(ctx, obj)
	}

	var reservation UploadObjectReservation
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUploadSessionBytes(tx, obj.ProfileID, obj.UploadID); err != nil {
			return err
		}

		previous, found, err := existingUploadObject(tx, obj.ProfileID, obj.UploadID, obj.Path)
		if err != nil {
			return err
		}
		previousSize := int64(0)
		if found && previous.ExpectedSize != nil {
			previousSize = *previous.ExpectedSize
		}

		delta := *obj.ExpectedSize - previousSize
		if delta != 0 {
			res := tx.Model(&uploadSessionRow{}).
				Where("profile_id = ? AND id = ?", obj.ProfileID, obj.UploadID).
				Where("bytes_tracked + ? >= 0", delta)
			if delta > 0 && maxBytes > 0 {
				res = res.Where("bytes_tracked + ? <= ?", delta, maxBytes)
			}
			res = res.UpdateColumn("bytes_tracked", gorm.Expr("bytes_tracked + ?", delta))
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return ErrUploadSessionBytesExceeded
			}
		}

		if err := upsertUploadObject(tx, obj); err != nil {
			return err
		}

		reservation = UploadObjectReservation{
			UploadID:  obj.UploadID,
			ProfileID: obj.ProfileID,
			Path:      obj.Path,
			Delta:     delta,
		}
		if found {
			previousCopy := previous
			reservation.Previous = &previousCopy
		}
		return nil
	})
	return reservation, err
}

func (s *Store) RollbackUploadObjectReservation(ctx context.Context, reservation UploadObjectReservation) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUploadSessionBytes(tx, reservation.ProfileID, reservation.UploadID); err != nil {
			return err
		}
		if reservation.Delta != 0 {
			res := tx.Model(&uploadSessionRow{}).
				Where("profile_id = ? AND id = ?", reservation.ProfileID, reservation.UploadID).
				Where("bytes_tracked + ? >= 0", -reservation.Delta).
				UpdateColumn("bytes_tracked", gorm.Expr("bytes_tracked + ?", -reservation.Delta))
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return ErrUploadSessionBytesExceeded
			}
		}
		if reservation.Previous != nil {
			return upsertUploadObject(tx, *reservation.Previous)
		}
		return tx.
			Where("profile_id = ? AND upload_id = ? AND path = ?", reservation.ProfileID, reservation.UploadID, reservation.Path).
			Delete(&uploadObjectRow{}).Error
	})
}

func lockUploadSessionBytes(tx *gorm.DB, profileID, uploadID string) error {
	res := tx.Model(&uploadSessionRow{}).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		UpdateColumn("bytes_tracked", gorm.Expr("bytes_tracked"))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		return nil
	}

	var count int64
	if err := tx.Model(&uploadSessionRow{}).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return ErrUploadSessionNotFound
	}
	return nil
}

func existingUploadObject(tx *gorm.DB, profileID, uploadID, path string) (UploadObject, bool, error) {
	var row uploadObjectRow
	if err := tx.
		Where("profile_id = ? AND upload_id = ? AND path = ?", profileID, uploadID, path).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return UploadObject{}, false, nil
		}
		return UploadObject{}, false, err
	}
	return UploadObject(row), true, nil
}

func upsertUploadObject(db *gorm.DB, obj UploadObject) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if obj.CreatedAt == "" {
		obj.CreatedAt = now
	}
	if obj.UpdatedAt == "" {
		obj.UpdatedAt = now
	}

	row := uploadObjectRow(obj)
	return db.Clauses(clause.OnConflict{
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

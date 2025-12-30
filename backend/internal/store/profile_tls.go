package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"s3desk/internal/models"
)

const profileTLSConfigSchemaVersion = 1

func (s *Store) GetProfileTLSConfig(ctx context.Context, profileID string) (models.ProfileTLSConfig, string, bool, error) {
	var row profileConnectionOptionsRow
	if err := s.db.WithContext(ctx).
		Select("schema_version", "options_enc", "updated_at").
		Where("profile_id = ?", profileID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ProfileTLSConfig{}, "", false, nil
		}
		return models.ProfileTLSConfig{}, "", false, err
	}
	if row.SchemaVersion != profileTLSConfigSchemaVersion {
		return models.ProfileTLSConfig{}, "", false, fmt.Errorf("unsupported tls options schema version: %d", row.SchemaVersion)
	}
	if s.crypto == nil {
		return models.ProfileTLSConfig{}, "", false, ErrEncryptionKeyRequired
	}
	raw, err := s.crypto.decryptString(row.OptionsEnc)
	if err != nil {
		return models.ProfileTLSConfig{}, "", false, err
	}

	var cfg models.ProfileTLSConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return models.ProfileTLSConfig{}, "", false, err
	}
	if strings.TrimSpace(string(cfg.Mode)) == "" {
		cfg.Mode = models.ProfileTLSModeDisabled
	}
	return cfg, row.UpdatedAt, true, nil
}

func (s *Store) UpsertProfileTLSConfig(ctx context.Context, profileID string, cfg models.ProfileTLSConfig) (models.ProfileTLSConfig, string, error) {
	if s.crypto == nil {
		return models.ProfileTLSConfig{}, "", ErrEncryptionKeyRequired
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		return models.ProfileTLSConfig{}, "", err
	}
	enc, err := s.crypto.encryptString(string(raw))
	if err != nil {
		return models.ProfileTLSConfig{}, "", err
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	row := profileConnectionOptionsRow{
		ProfileID:     profileID,
		SchemaVersion: profileTLSConfigSchemaVersion,
		OptionsEnc:    enc,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "profile_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"schema_version",
				"options_enc",
				"updated_at",
			}),
		}).
		Create(&row).Error; err != nil {
		return models.ProfileTLSConfig{}, "", err
	}
	return cfg, now, nil
}

func (s *Store) DeleteProfileTLSConfig(ctx context.Context, profileID string) (bool, error) {
	res := s.db.WithContext(ctx).
		Where("profile_id = ?", profileID).
		Delete(&profileConnectionOptionsRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

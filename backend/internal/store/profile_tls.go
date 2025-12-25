package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"object-storage/internal/models"
)

const profileTLSConfigSchemaVersion = 1

func (s *Store) GetProfileTLSConfig(ctx context.Context, profileID string) (models.ProfileTLSConfig, string, bool, error) {
	var schemaVersion int
	var enc, updatedAt string
	err := s.db.QueryRowContext(ctx, `
		SELECT schema_version, options_enc, updated_at
		FROM profile_connection_options
		WHERE profile_id = ?
	`, profileID).Scan(&schemaVersion, &enc, &updatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ProfileTLSConfig{}, "", false, nil
		}
		return models.ProfileTLSConfig{}, "", false, err
	}
	if schemaVersion != profileTLSConfigSchemaVersion {
		return models.ProfileTLSConfig{}, "", false, fmt.Errorf("unsupported tls options schema version: %d", schemaVersion)
	}
	if s.crypto == nil {
		return models.ProfileTLSConfig{}, "", false, ErrEncryptionKeyRequired
	}
	raw, err := s.crypto.decryptString(enc)
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
	return cfg, updatedAt, true, nil
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
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO profile_connection_options (profile_id, schema_version, options_enc, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(profile_id) DO UPDATE SET
			schema_version = excluded.schema_version,
			options_enc = excluded.options_enc,
			updated_at = excluded.updated_at
	`, profileID, profileTLSConfigSchemaVersion, enc, now, now)
	if err != nil {
		return models.ProfileTLSConfig{}, "", err
	}
	return cfg, now, nil
}

func (s *Store) DeleteProfileTLSConfig(ctx context.Context, profileID string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM profile_connection_options
		WHERE profile_id = ?
	`, profileID)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

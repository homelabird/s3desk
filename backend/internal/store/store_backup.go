package store

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func (s *Store) CreateSQLiteBackup(ctx context.Context, destPath string) error {
	if s == nil || s.db == nil {
		return errors.New("store is not initialized")
	}

	destPath = filepath.Clean(strings.TrimSpace(destPath))
	if destPath == "" {
		return errors.New("destination path is required")
	}
	if err := os.MkdirAll(filepath.Dir(destPath), 0o700); err != nil {
		return err
	}
	if err := os.Remove(destPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}

	stmt := "VACUUM INTO " + sqliteStringLiteral(destPath)
	if err := s.db.WithContext(ctx).Exec(stmt).Error; err != nil {
		return err
	}
	return os.Chmod(destPath, 0o600)
}

func sqliteStringLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

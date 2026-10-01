package store

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
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

// ValidateSQLiteSnapshot never migrates or writes to the staged database.
func ValidateSQLiteSnapshot(ctx context.Context, path string) error {
	dsn := (&url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro&immutable=1"}).String()
	connection, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		return fmt.Errorf("open sqlite snapshot: %w", err)
	}
	sqlDB, err := connection.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	rows, err := sqlDB.QueryContext(ctx, "PRAGMA integrity_check")
	if err != nil {
		return fmt.Errorf("sqlite integrity check: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var result string
		if err := rows.Scan(&result); err != nil {
			return err
		}
		if result != "ok" {
			return fmt.Errorf("sqlite snapshot failed integrity check: %s", result)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	foreignKeys, err := sqlDB.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return fmt.Errorf("sqlite foreign key check: %w", err)
	}
	defer foreignKeys.Close()
	if foreignKeys.Next() {
		return fmt.Errorf("sqlite snapshot contains a foreign key violation")
	}
	if err := foreignKeys.Err(); err != nil {
		return err
	}
	for _, model := range []any{&profileRow{}, &profileConnectionOptionsRow{}, &jobRow{}, &uploadSessionRow{}, &uploadMultipartRow{}, &uploadObjectRow{}, &objectIndexRow{}, &objectIndexReplacementRow{}, &objectFavoriteRow{}} {
		statement := &gorm.Statement{DB: connection}
		if err := statement.Parse(model); err != nil {
			return err
		}
		// Check the actual store model columns without loading any rows.
		if err := connection.WithContext(ctx).Model(model).Select(statement.Schema.DBNames).Limit(0).Find(model).Error; err != nil {
			return fmt.Errorf("sqlite snapshot schema for %s: %w", statement.Schema.Table, err)
		}
	}
	return nil
}

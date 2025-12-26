package store

import (
	"context"
	"database/sql"
)

func (s *Store) exec(ctx context.Context, query string, args ...any) (int64, error) {
	res := s.db.WithContext(ctx).Exec(query, args...)
	return res.RowsAffected, res.Error
}

func (s *Store) query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return s.db.WithContext(ctx).Raw(query, args...).Rows()
}

func (s *Store) queryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return s.db.WithContext(ctx).Raw(query, args...).Row()
}

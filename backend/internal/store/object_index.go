package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
	"unicode"

	"object-storage/internal/models"
)

var ErrObjectIndexNotFound = errors.New("object index not found")

type ObjectIndexEntry struct {
	Key          string
	Size         int64
	ETag         string
	LastModified string
}

type SearchObjectIndexInput struct {
	Bucket         string
	Query          string
	Prefix         string
	Limit          int
	Cursor         *string
	Extension      string
	MinSize        *int64
	MaxSize        *int64
	ModifiedAfter  string
	ModifiedBefore string
}

type SummarizeObjectIndexInput struct {
	Bucket      string
	Prefix      string
	SampleLimit int
}

func (s *Store) ClearObjectIndex(ctx context.Context, profileID, bucket, prefix string) error {
	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")

	if prefix == "" {
		_, err := s.exec(ctx, `DELETE FROM object_index WHERE profile_id=? AND bucket=?`, profileID, bucket)
		return err
	}

	pat := escapeLike(prefix) + "%"
	_, err := s.exec(ctx, `DELETE FROM object_index WHERE profile_id=? AND bucket=? AND object_key LIKE ? ESCAPE '\'`, profileID, bucket, pat)
	return err
}

func (s *Store) UpsertObjectIndexBatch(ctx context.Context, profileID, bucket string, entries []ObjectIndexEntry, indexedAt string) error {
	if len(entries) == 0 {
		return nil
	}
	if indexedAt == "" {
		indexedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, s.rebind(`
		INSERT INTO object_index (profile_id, bucket, object_key, size, etag, last_modified, indexed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(profile_id, bucket, object_key) DO UPDATE SET
			size=excluded.size,
			etag=excluded.etag,
			last_modified=excluded.last_modified,
			indexed_at=excluded.indexed_at
	`))
	if err != nil {
		return err
	}
	defer func() { _ = stmt.Close() }()

	for _, e := range entries {
		if e.Key == "" {
			continue
		}
		if _, err := stmt.ExecContext(ctx, profileID, bucket, e.Key, e.Size, nullableString(nonEmptyPtr(e.ETag)), nullableString(nonEmptyPtr(e.LastModified)), indexedAt); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) SearchObjectIndex(ctx context.Context, profileID string, in SearchObjectIndexInput) (models.SearchObjectsResponse, error) {
	in.Bucket = strings.TrimSpace(in.Bucket)
	in.Query = strings.TrimSpace(in.Query)
	in.Prefix = strings.TrimPrefix(strings.TrimSpace(in.Prefix), "/")
	in.Extension = strings.TrimSpace(in.Extension)
	in.Extension = strings.TrimPrefix(in.Extension, ".")
	in.Extension = strings.ToLower(in.Extension)
	if in.MinSize != nil && in.MaxSize != nil && *in.MinSize > *in.MaxSize {
		min := *in.MaxSize
		max := *in.MinSize
		in.MinSize = &min
		in.MaxSize = &max
	}
	if in.ModifiedAfter != "" && in.ModifiedBefore != "" && in.ModifiedAfter > in.ModifiedBefore {
		in.ModifiedAfter, in.ModifiedBefore = in.ModifiedBefore, in.ModifiedAfter
	}

	limit := in.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	if in.Bucket == "" {
		return models.SearchObjectsResponse{}, errors.New("bucket is required")
	}
	if in.Query == "" {
		return models.SearchObjectsResponse{}, errors.New("query is required")
	}

	tokens := splitSearchTokens(in.Query)
	if len(tokens) == 0 {
		tokens = []string{in.Query}
	}

	var exists int
	if err := s.queryRow(ctx, `SELECT 1 FROM object_index WHERE profile_id=? AND bucket=? LIMIT 1`, profileID, in.Bucket).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.SearchObjectsResponse{}, ErrObjectIndexNotFound
		}
		return models.SearchObjectsResponse{}, err
	}

	args := []any{profileID, in.Bucket}
	where := `WHERE profile_id=? AND bucket=?`
	if in.Prefix != "" {
		where += ` AND object_key LIKE ? ESCAPE '\'`
		args = append(args, escapeLike(in.Prefix)+"%")
	}
	for _, tok := range tokens {
		if tok == "" {
			continue
		}
		where += ` AND object_key LIKE ? ESCAPE '\'`
		args = append(args, "%"+escapeLike(tok)+"%")
	}
	if in.Extension != "" {
		where += ` AND object_key LIKE ? ESCAPE '\'`
		args = append(args, "%."+escapeLike(in.Extension))
	}
	if in.MinSize != nil {
		where += ` AND size >= ?`
		args = append(args, *in.MinSize)
	}
	if in.MaxSize != nil {
		where += ` AND size <= ?`
		args = append(args, *in.MaxSize)
	}
	if in.ModifiedAfter != "" || in.ModifiedBefore != "" {
		where += ` AND last_modified IS NOT NULL`
		if in.ModifiedAfter != "" {
			where += ` AND last_modified >= ?`
			args = append(args, in.ModifiedAfter)
		}
		if in.ModifiedBefore != "" {
			where += ` AND last_modified <= ?`
			args = append(args, in.ModifiedBefore)
		}
	}
	if in.Cursor != nil && *in.Cursor != "" {
		where += ` AND object_key > ?`
		args = append(args, *in.Cursor)
	}

	rows, err := s.query(ctx, `
		SELECT object_key, size, etag, last_modified
		FROM object_index
		`+where+`
		ORDER BY object_key ASC
		LIMIT ?
	`, append(args, limit+1)...)
	if err != nil {
		return models.SearchObjectsResponse{}, err
	}
	defer rows.Close()

	resp := models.SearchObjectsResponse{
		Bucket: in.Bucket,
		Query:  in.Query,
		Prefix: in.Prefix,
		Items:  make([]models.ObjectItem, 0, limit),
	}

	var (
		count   int
		lastKey string
		hasMore bool
	)
	for rows.Next() {
		var (
			key          string
			size         int64
			etag         sql.NullString
			lastModified sql.NullString
		)
		if err := rows.Scan(&key, &size, &etag, &lastModified); err != nil {
			return models.SearchObjectsResponse{}, err
		}
		count++
		if count <= limit {
			item := models.ObjectItem{
				Key:  key,
				Size: size,
			}
			if etag.Valid {
				item.ETag = etag.String
			}
			if lastModified.Valid {
				item.LastModified = lastModified.String
			}
			resp.Items = append(resp.Items, item)
			lastKey = key
		} else {
			hasMore = true
		}
	}
	if err := rows.Err(); err != nil {
		return models.SearchObjectsResponse{}, err
	}

	if hasMore && lastKey != "" {
		resp.NextCursor = &lastKey
	}
	return resp, nil
}

func (s *Store) SummarizeObjectIndex(ctx context.Context, profileID string, in SummarizeObjectIndexInput) (models.ObjectIndexSummaryResponse, error) {
	in.Bucket = strings.TrimSpace(in.Bucket)
	in.Prefix = strings.TrimPrefix(strings.TrimSpace(in.Prefix), "/")

	if in.Bucket == "" {
		return models.ObjectIndexSummaryResponse{}, errors.New("bucket is required")
	}

	sampleLimit := in.SampleLimit
	if sampleLimit <= 0 {
		sampleLimit = 10
	}
	if sampleLimit > 100 {
		sampleLimit = 100
	}

	var exists int
	if err := s.queryRow(ctx, `SELECT 1 FROM object_index WHERE profile_id=? AND bucket=? LIMIT 1`, profileID, in.Bucket).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ObjectIndexSummaryResponse{}, ErrObjectIndexNotFound
		}
		return models.ObjectIndexSummaryResponse{}, err
	}

	args := []any{profileID, in.Bucket}
	where := `WHERE profile_id=? AND bucket=?`
	if in.Prefix != "" {
		where += ` AND object_key LIKE ? ESCAPE '\'`
		args = append(args, escapeLike(in.Prefix)+"%")
	}

	var (
		count     int64
		total     sql.NullInt64
		indexedAt sql.NullString
	)
	if err := s.queryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(size), 0), MAX(indexed_at)
		FROM object_index
		`+where+`
	`, args...).Scan(&count, &total, &indexedAt); err != nil {
		return models.ObjectIndexSummaryResponse{}, err
	}

	rows, err := s.query(ctx, `
		SELECT object_key
		FROM object_index
		`+where+`
		ORDER BY object_key ASC
		LIMIT ?
	`, append(args, sampleLimit)...)
	if err != nil {
		return models.ObjectIndexSummaryResponse{}, err
	}
	defer rows.Close()

	sample := make([]string, 0, sampleLimit)
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return models.ObjectIndexSummaryResponse{}, err
		}
		if k != "" {
			sample = append(sample, k)
		}
	}
	if err := rows.Err(); err != nil {
		return models.ObjectIndexSummaryResponse{}, err
	}

	resp := models.ObjectIndexSummaryResponse{
		Bucket:      in.Bucket,
		Prefix:      in.Prefix,
		ObjectCount: count,
		TotalBytes:  0,
		SampleKeys:  sample,
	}
	if total.Valid {
		resp.TotalBytes = total.Int64
	}
	if indexedAt.Valid && strings.TrimSpace(indexedAt.String) != "" {
		resp.IndexedAt = &indexedAt.String
	}
	return resp, nil
}

func escapeLike(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	value = strings.ReplaceAll(value, "%", "\\%")
	value = strings.ReplaceAll(value, "_", "\\_")
	return value
}

func splitSearchTokens(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	var (
		tokens []string
		b      strings.Builder
	)

	flush := func() {
		if b.Len() == 0 {
			return
		}
		t := b.String()
		b.Reset()
		if t != "" {
			tokens = append(tokens, t)
		}
	}

	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(unicode.ToLower(r))
			continue
		}
		flush()
	}
	flush()

	if len(tokens) == 0 {
		return nil
	}

	// Dedupe while preserving order, and cap token count to keep the query bounded.
	seen := make(map[string]struct{}, len(tokens))
	out := make([]string, 0, len(tokens))
	for _, t := range tokens {
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
		if len(out) >= 8 {
			break
		}
	}
	return out
}

func nonEmptyPtr(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

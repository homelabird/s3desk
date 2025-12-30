package store

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"s3desk/internal/models"
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

	query := s.db.WithContext(ctx).
		Where("profile_id = ? AND bucket = ?", profileID, bucket)

	if prefix != "" {
		pat := escapeLike(prefix) + "%"
		query = query.Where(`object_key LIKE ? ESCAPE '\'`, pat)
	}

	return query.Delete(&objectIndexRow{}).Error
}

func (s *Store) UpsertObjectIndexBatch(ctx context.Context, profileID, bucket string, entries []ObjectIndexEntry, indexedAt string) error {
	if len(entries) == 0 {
		return nil
	}
	if indexedAt == "" {
		indexedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}

	rows := make([]objectIndexRow, 0, len(entries))
	for _, e := range entries {
		if e.Key == "" {
			continue
		}
		rows = append(rows, objectIndexRow{
			ProfileID:    profileID,
			Bucket:       bucket,
			ObjectKey:    e.Key,
			Size:         e.Size,
			ETag:         nonEmptyPtr(e.ETag),
			LastModified: nonEmptyPtr(e.LastModified),
			IndexedAt:    indexedAt,
		})
	}
	if len(rows) == 0 {
		return nil
	}

	tx := s.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return tx.Error
	}
	defer func() { _ = tx.Rollback() }()

	if err := tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "profile_id"},
			{Name: "bucket"},
			{Name: "object_key"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"size", "etag", "last_modified", "indexed_at"}),
	}).CreateInBatches(rows, 500).Error; err != nil {
		return err
	}

	return tx.Commit().Error
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

	var probe objectIndexRow
	if err := s.db.WithContext(ctx).
		Select("object_key").
		Where("profile_id = ? AND bucket = ?", profileID, in.Bucket).
		Limit(1).
		Take(&probe).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.SearchObjectsResponse{}, ErrObjectIndexNotFound
		}
		return models.SearchObjectsResponse{}, err
	}

	query := s.db.WithContext(ctx).
		Model(&objectIndexRow{}).
		Where("profile_id = ? AND bucket = ?", profileID, in.Bucket)
	if in.Prefix != "" {
		query = query.Where(`object_key LIKE ? ESCAPE '\'`, escapeLike(in.Prefix)+"%")
	}
	for _, tok := range tokens {
		if tok == "" {
			continue
		}
		query = query.Where(`object_key LIKE ? ESCAPE '\'`, "%"+escapeLike(tok)+"%")
	}
	if in.Extension != "" {
		query = query.Where(`object_key LIKE ? ESCAPE '\'`, "%."+escapeLike(in.Extension))
	}
	if in.MinSize != nil {
		query = query.Where("size >= ?", *in.MinSize)
	}
	if in.MaxSize != nil {
		query = query.Where("size <= ?", *in.MaxSize)
	}
	if in.ModifiedAfter != "" || in.ModifiedBefore != "" {
		query = query.Where("last_modified IS NOT NULL")
		if in.ModifiedAfter != "" {
			query = query.Where("last_modified >= ?", in.ModifiedAfter)
		}
		if in.ModifiedBefore != "" {
			query = query.Where("last_modified <= ?", in.ModifiedBefore)
		}
	}
	if in.Cursor != nil && *in.Cursor != "" {
		query = query.Where("object_key > ?", *in.Cursor)
	}

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
	var rows []objectIndexRow
	if err := query.
		Select("object_key", "size", "etag", "last_modified").
		Order("object_key ASC").
		Limit(limit + 1).
		Find(&rows).Error; err != nil {
		return models.SearchObjectsResponse{}, err
	}

	for _, row := range rows {
		count++
		if count <= limit {
			item := models.ObjectItem{
				Key:  row.ObjectKey,
				Size: row.Size,
			}
			if row.ETag != nil {
				item.ETag = *row.ETag
			}
			if row.LastModified != nil {
				item.LastModified = *row.LastModified
			}
			resp.Items = append(resp.Items, item)
			lastKey = row.ObjectKey
		} else {
			hasMore = true
		}
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

	base := s.db.WithContext(ctx).
		Model(&objectIndexRow{}).
		Where("profile_id = ? AND bucket = ?", profileID, in.Bucket)
	if in.Prefix != "" {
		base = base.Where(`object_key LIKE ? ESCAPE '\'`, escapeLike(in.Prefix)+"%")
	}

	var probe objectIndexRow
	if err := base.
		Select("object_key").
		Limit(1).
		Take(&probe).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ObjectIndexSummaryResponse{}, ErrObjectIndexNotFound
		}
		return models.ObjectIndexSummaryResponse{}, err
	}

	var summary struct {
		Count     int64   `gorm:"column:count"`
		Total     int64   `gorm:"column:total_bytes"`
		IndexedAt *string `gorm:"column:indexed_at"`
	}
	if err := base.
		Select("COUNT(*) AS count, COALESCE(SUM(size), 0) AS total_bytes, MAX(indexed_at) AS indexed_at").
		Scan(&summary).Error; err != nil {
		return models.ObjectIndexSummaryResponse{}, err
	}

	var sampleRows []objectIndexRow
	if err := base.
		Select("object_key").
		Order("object_key ASC").
		Limit(sampleLimit).
		Find(&sampleRows).Error; err != nil {
		return models.ObjectIndexSummaryResponse{}, err
	}
	sample := make([]string, 0, len(sampleRows))
	for _, row := range sampleRows {
		if row.ObjectKey != "" {
			sample = append(sample, row.ObjectKey)
		}
	}

	resp := models.ObjectIndexSummaryResponse{
		Bucket:      in.Bucket,
		Prefix:      in.Prefix,
		ObjectCount: summary.Count,
		TotalBytes:  0,
		SampleKeys:  sample,
	}
	resp.TotalBytes = summary.Total
	if summary.IndexedAt != nil && strings.TrimSpace(*summary.IndexedAt) != "" {
		resp.IndexedAt = summary.IndexedAt
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

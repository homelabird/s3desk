package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"s3desk/internal/db"
)

func TestObjectIndexRuntimeEvidence(t *testing.T) {
	path := os.Getenv("S3DESK_RUNTIME_SQLITE_PATH")
	if path == "" {
		t.Skip("S3DESK_RUNTIME_SQLITE_PATH is not set")
	}
	gormDB, err := gorm.Open(sqlite.Open("file:"+path+"?mode=ro"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	type scope struct {
		ProfileID string
		Bucket    string
		Count     int64
	}
	var scopes []scope
	if err := gormDB.Raw(`
		SELECT profile_id, bucket, COUNT(*) AS count
		FROM object_index
		GROUP BY profile_id, bucket
		ORDER BY count DESC
	`).Scan(&scopes).Error; err != nil {
		t.Fatal(err)
	}
	var total int64
	for _, scope := range scopes {
		total += scope.Count
	}
	if len(scopes) == 0 {
		t.Log("object_index scopes=0 total_rows=0")
		return
	}

	st := &Store{db: gormDB}
	durations := make([]time.Duration, 20)
	for i := range durations {
		started := time.Now()
		if _, err := st.SearchObjectIndex(context.Background(), scopes[0].ProfileID, SearchObjectIndexInput{
			Bucket: scopes[0].Bucket,
			Query:  "__s3desk_runtime_probe_01M02AM1NJRP6G5Z3Q9Y7X4T8K__",
		}); err != nil {
			t.Fatal(err)
		}
		durations[i] = time.Since(started)
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	t.Logf(
		"object_index scopes=%d total_rows=%d max_scope_rows=%d miss_p50=%s miss_p95=%s",
		len(scopes), total, scopes[0].Count, durations[len(durations)/2], durations[18],
	)
}

func BenchmarkSearchObjectIndex(b *testing.B) {
	backend := db.BackendSQLite
	cfg := db.Config{Backend: backend, SQLitePath: filepath.Join(b.TempDir(), "search-bench.db")}
	if databaseURL := os.Getenv("S3DESK_BENCH_DATABASE_URL"); databaseURL != "" {
		backend = db.BackendPostgres
		cfg = db.Config{Backend: backend, DatabaseURL: databaseURL}
	}
	gormDB, err := db.Open(cfg)
	if err != nil {
		b.Fatal(err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() { _ = sqlDB.Close() })
	st, err := New(gormDB, Options{})
	if err != nil {
		b.Fatal(err)
	}
	profile := createTestProfile(b, st)

	for _, count := range []int{1_000, 100_000, 1_000_000} {
		bucket := fmt.Sprintf("bench-%d", count)
		indexedAt := time.Now().UTC().Format(time.RFC3339Nano)
		for start := 0; start < count; start += 500 {
			end := min(start+500, count)
			entries := make([]ObjectIndexEntry, 0, end-start)
			for i := start; i < end; i++ {
				key := fmt.Sprintf("objects/%07d.bin", i)
				if i%1000 == 0 {
					key = fmt.Sprintf("target/reports/2026/needle-%07d.txt", i)
				}
				entries = append(entries, ObjectIndexEntry{Key: key, Size: int64(i)})
			}
			if err := st.UpsertObjectIndexBatch(context.Background(), profile.ID, bucket, entries, indexedAt); err != nil {
				b.Fatal(err)
			}
		}

		for _, query := range []struct {
			name  string
			input SearchObjectIndexInput
		}{
			{name: "contains-1-miss", input: SearchObjectIndexInput{Bucket: bucket, Query: "absent"}},
			{name: "contains-3-miss", input: SearchObjectIndexInput{Bucket: bucket, Query: "absent report 2026"}},
			{name: "prefix-contains-hit", input: SearchObjectIndexInput{Bucket: bucket, Prefix: "target/", Query: "needle"}},
		} {
			b.Run(fmt.Sprintf("%s/%d", query.name, count), func(b *testing.B) {
				for i := 0; i < b.N; i++ {
					if _, err := st.SearchObjectIndex(context.Background(), profile.ID, query.input); err != nil {
						b.Fatal(err)
					}
				}
			})
		}
	}
}

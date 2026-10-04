package store

import (
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/oklog/ulid/v2"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"s3desk/internal/db"
)

func TestPostgresTransactionReliability(t *testing.T) {
	st := newPostgresTestStore(t)

	tests := []struct {
		name string
		run  func(*testing.T, *Store)
	}{
		{"upload object byte limit", testUpsertUploadObjectWithByteLimitConcurrentSessionLimit},
		{"upload session byte limit", testAddUploadSessionBytesWithinLimitRejectsConcurrentOverage},
		{"upload metadata rollback", testDeleteUploadSessionRollsBackAllMetadataOnFailure},
		{"expired upload pagination", testListExpiredUploadSessionsPagination},
		{"profile rollback", testUpdateProfileRollsBackWhenReloadFails},
		{"profile concurrent updates", testUpdateProfileSerializesProviderConfigChanges},
		{"job batch rollback", testCancelQueuedJobsByIDsRollsBackFailedBatch},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) { test.run(t, st) })
	}
}

func newPostgresTestStore(t *testing.T) *Store {
	t.Helper()
	databaseURL := strings.TrimSpace(os.Getenv("S3DESK_TEST_POSTGRES_URL"))
	if databaseURL == "" {
		t.Skip("set S3DESK_TEST_POSTGRES_URL to a disposable PostgreSQL database")
	}

	// Each test owns its schema so replacement never consumes another test's state.
	admin, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{})
	if err != nil {
		t.Fatalf("open PostgreSQL schema owner: %v", err)
	}
	adminPool, err := admin.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = adminPool.Close() })
	schema := "test_" + strings.ToLower(ulid.Make().String())
	if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error })
	if strings.Contains(databaseURL, "://") {
		parsed, err := url.Parse(databaseURL)
		if err != nil {
			t.Fatal("invalid PostgreSQL test URL")
		}
		query := parsed.Query()
		query.Set("search_path", schema)
		parsed.RawQuery = query.Encode()
		databaseURL = parsed.String()
	} else {
		databaseURL += " search_path=" + schema
	}

	gormDB, err := db.Open(db.Config{Backend: db.BackendPostgres, DatabaseURL: databaseURL})
	if err != nil {
		t.Fatalf("open PostgreSQL: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("open PostgreSQL connection pool: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	st, err := New(gormDB, Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return st
}

package store

import (
	"os"
	"strings"
	"testing"

	"s3desk/internal/db"
)

func TestPostgresTransactionReliability(t *testing.T) {
	databaseURL := strings.TrimSpace(os.Getenv("S3DESK_TEST_POSTGRES_URL"))
	if databaseURL == "" {
		t.Skip("set S3DESK_TEST_POSTGRES_URL to a disposable PostgreSQL database")
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

	tests := []struct {
		name string
		run  func(*testing.T, *Store)
	}{
		{"upload object byte limit", testUpsertUploadObjectWithByteLimitConcurrentSessionLimit},
		{"upload session byte limit", testAddUploadSessionBytesWithinLimitRejectsConcurrentOverage},
		{"upload metadata rollback", testDeleteUploadSessionRollsBackAllMetadataOnFailure},
		{"profile rollback", testUpdateProfileRollsBackWhenReloadFails},
		{"profile concurrent updates", testUpdateProfileSerializesProviderConfigChanges},
		{"job batch rollback", testCancelQueuedJobsByIDsRollsBackFailedBatch},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) { test.run(t, st) })
	}
}

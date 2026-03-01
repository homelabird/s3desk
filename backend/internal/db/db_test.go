package db

import (
	"path/filepath"
	"testing"
)

func TestSQLitePragmasApplied(t *testing.T) {
	dir := t.TempDir()
	gormDB, err := Open(Config{
		Backend:    BackendSQLite,
		SQLitePath: filepath.Join(dir, "test.db"),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("get sql.DB: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	pragmas := map[string]string{
		"journal_mode": "wal",
		"synchronous":  "1", // NORMAL = 1
		"foreign_keys": "1",
	}

	for pragma, want := range pragmas {
		var got string
		row := sqlDB.QueryRow("PRAGMA " + pragma + ";")
		if err := row.Scan(&got); err != nil {
			t.Fatalf("PRAGMA %s: %v", pragma, err)
		}
		if got != want {
			t.Errorf("PRAGMA %s = %q, want %q", pragma, got, want)
		}
	}
}

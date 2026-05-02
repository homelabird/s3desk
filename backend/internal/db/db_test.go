package db

import (
	"path/filepath"
	"reflect"
	"sort"
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

func TestSchemaMigrationsRecorded(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	gormDB, err := Open(Config{
		Backend:    BackendSQLite,
		SQLitePath: dbPath,
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("get sql.DB: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	var got []string
	rows, err := sqlDB.Query("SELECT id FROM schema_migrations ORDER BY id;")
	if err != nil {
		t.Fatalf("query schema migrations: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan schema migration: %v", err)
		}
		got = append(got, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate schema migrations: %v", err)
	}

	want := make([]string, 0, len(schemaMigrationRegistry))
	for _, migration := range schemaMigrationRegistry {
		want = append(want, migration.ID)
	}
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("schema migrations = %#v, want %#v", got, want)
	}
}

func TestPortableDataTableNamesExistInMigratedSchema(t *testing.T) {
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

	for _, table := range PortableDataTableNames() {
		if !gormDB.Migrator().HasTable(table) {
			t.Fatalf("portable data table %q missing from migrated schema", table)
		}
	}
}

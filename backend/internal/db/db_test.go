package db

import (
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
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

func TestOpenMigratesLegacySQLiteSchemaAndPreservesRecords(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "s3desk.db")

	legacyDB, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	legacyStatements := []string{
		`CREATE TABLE profiles (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			endpoint TEXT NOT NULL,
			region TEXT NOT NULL,
			force_path_style INTEGER NOT NULL,
			tls_insecure_skip_verify INTEGER NOT NULL,
			access_key_id TEXT NOT NULL,
			secret_access_key TEXT NOT NULL,
			session_token TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE jobs (
			id TEXT PRIMARY KEY,
			profile_id TEXT NOT NULL,
			type TEXT NOT NULL,
			status TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			progress_json TEXT,
			error TEXT,
			created_at TEXT NOT NULL,
			started_at TEXT,
			finished_at TEXT
		);`,
		`CREATE TABLE upload_sessions (
			id TEXT PRIMARY KEY,
			profile_id TEXT NOT NULL,
			bucket TEXT NOT NULL,
			prefix TEXT NOT NULL,
			staging_dir TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`INSERT INTO profiles (
			id, name, endpoint, region, force_path_style, tls_insecure_skip_verify,
			access_key_id, secret_access_key, session_token, created_at, updated_at
		) VALUES ('legacy-profile', 'Legacy profile', 'http://minio:9000', 'us-east-1', 1, 0,
			'legacy-access', 'legacy-secret', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');`,
		`INSERT INTO jobs (
			id, profile_id, type, status, payload_json, progress_json, error, created_at,
			started_at, finished_at
		) VALUES ('legacy-job', 'legacy-profile', 's3_index_objects', 'completed', '{}', NULL, NULL,
			'2026-01-01T00:00:00Z', NULL, '2026-01-01T00:01:00Z');`,
		`INSERT INTO upload_sessions (
			id, profile_id, bucket, prefix, staging_dir, expires_at, created_at
		) VALUES ('legacy-upload', 'legacy-profile', 'legacy-bucket', 'incoming/', '/data/staging/legacy-upload',
			'2099-01-01T00:00:00Z', '2026-01-01T00:00:00Z');`,
	}
	for _, statement := range legacyStatements {
		if err := legacyDB.Exec(statement).Error; err != nil {
			t.Fatalf("seed legacy db: %v", err)
		}
	}
	legacySQLDB, err := legacyDB.DB()
	if err != nil {
		t.Fatalf("get legacy sql db: %v", err)
	}
	if err := legacySQLDB.Close(); err != nil {
		t.Fatalf("close legacy db: %v", err)
	}

	migrated, err := Open(Config{Backend: BackendSQLite, SQLitePath: dbPath})
	if err != nil {
		t.Fatalf("open migrated db: %v", err)
	}
	migratedSQLDB, err := migrated.DB()
	if err != nil {
		t.Fatalf("get migrated sql db: %v", err)
	}

	var profile struct {
		Name                 string
		Provider             string
		ConfigJSON           string
		SecretsJSON          string
		PublicEndpoint       string
		PreserveLeadingSlash int
	}
	if err := migratedSQLDB.QueryRow(`SELECT name, provider, config_json, secrets_json, public_endpoint, preserve_leading_slash FROM profiles WHERE id = 'legacy-profile'`).Scan(
		&profile.Name,
		&profile.Provider,
		&profile.ConfigJSON,
		&profile.SecretsJSON,
		&profile.PublicEndpoint,
		&profile.PreserveLeadingSlash,
	); err != nil {
		t.Fatalf("read migrated profile: %v", err)
	}
	if profile.Name != "Legacy profile" || profile.Provider != "s3_compatible" || profile.ConfigJSON != "{}" || profile.SecretsJSON != "{}" || profile.PublicEndpoint != "" || profile.PreserveLeadingSlash != 0 {
		t.Fatalf("migrated profile = %+v, want preserved data plus legacy defaults", profile)
	}

	var errorCode string
	if err := migratedSQLDB.QueryRow(`SELECT COALESCE(error_code, '') FROM jobs WHERE id = 'legacy-job'`).Scan(&errorCode); err != nil {
		t.Fatalf("read migrated job: %v", err)
	}
	if errorCode != "" {
		t.Fatalf("legacy job error_code=%q, want empty default", errorCode)
	}

	var mode string
	var bytesTracked int64
	if err := migratedSQLDB.QueryRow(`SELECT mode, bytes_tracked FROM upload_sessions WHERE id = 'legacy-upload'`).Scan(&mode, &bytesTracked); err != nil {
		t.Fatalf("read migrated upload session: %v", err)
	}
	if mode != "staging" || bytesTracked != 0 {
		t.Fatalf("migrated upload session mode=%q bytes_tracked=%d, want staging/0", mode, bytesTracked)
	}

	var migrationCount int
	if err := migratedSQLDB.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrationCount); err != nil {
		t.Fatalf("count migrated schema versions: %v", err)
	}
	if migrationCount != len(schemaMigrationRegistry) {
		t.Fatalf("schema migration count=%d, want %d", migrationCount, len(schemaMigrationRegistry))
	}
	if err := migratedSQLDB.Close(); err != nil {
		t.Fatalf("close migrated db: %v", err)
	}

	reopened, err := Open(Config{Backend: BackendSQLite, SQLitePath: dbPath})
	if err != nil {
		t.Fatalf("reopen migrated db: %v", err)
	}
	reopenedSQLDB, err := reopened.DB()
	if err != nil {
		t.Fatalf("get reopened sql db: %v", err)
	}
	t.Cleanup(func() { _ = reopenedSQLDB.Close() })
	if err := reopenedSQLDB.QueryRow(`SELECT COUNT(*) FROM profiles WHERE id = 'legacy-profile'`).Scan(&migrationCount); err != nil {
		t.Fatalf("verify reopened profile: %v", err)
	}
	if migrationCount != 1 {
		t.Fatalf("reopened legacy profile count=%d, want 1", migrationCount)
	}
}

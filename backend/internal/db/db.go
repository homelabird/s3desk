package db

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

func Open(dbPath string) (*sql.DB, error) {
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	if _, err := sqlDB.Exec(`PRAGMA busy_timeout=5000;`); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	if _, err := sqlDB.Exec(`PRAGMA foreign_keys=ON;`); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	if _, err := sqlDB.Exec(`PRAGMA journal_mode=WAL;`); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}

	if err := migrate(sqlDB); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}

	return sqlDB, nil
}

func migrate(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS profiles (
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
		`CREATE TABLE IF NOT EXISTS profile_connection_options (
			profile_id TEXT PRIMARY KEY,
			schema_version INTEGER NOT NULL,
			options_enc TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS jobs (
			id TEXT PRIMARY KEY,
			profile_id TEXT NOT NULL,
			type TEXT NOT NULL,
			status TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			progress_json TEXT,
			error TEXT,
			created_at TEXT NOT NULL,
			started_at TEXT,
			finished_at TEXT,
			FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_profile_id ON jobs(profile_id);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_profile_id_id ON jobs(profile_id, id);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_finished_at ON jobs(finished_at);`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_status_finished_at ON jobs(status, finished_at);`,

		`CREATE TABLE IF NOT EXISTS upload_sessions (
			id TEXT PRIMARY KEY,
			profile_id TEXT NOT NULL,
			bucket TEXT NOT NULL,
			prefix TEXT NOT NULL,
			staging_dir TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_upload_sessions_profile_id ON upload_sessions(profile_id);`,
		`CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at ON upload_sessions(expires_at);`,

		`CREATE TABLE IF NOT EXISTS object_index (
			profile_id TEXT NOT NULL,
			bucket TEXT NOT NULL,
			object_key TEXT NOT NULL,
			size INTEGER NOT NULL,
			etag TEXT,
			last_modified TEXT,
			indexed_at TEXT NOT NULL,
			PRIMARY KEY(profile_id, bucket, object_key),
			FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_object_index_profile_bucket_key ON object_index(profile_id, bucket, object_key);`,
		`CREATE INDEX IF NOT EXISTS idx_object_index_profile_bucket_indexed_at ON object_index(profile_id, bucket, indexed_at);`,

		`CREATE TABLE IF NOT EXISTS object_favorites (
			profile_id TEXT NOT NULL,
			bucket TEXT NOT NULL,
			object_key TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY(profile_id, bucket, object_key),
			FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_object_favorites_profile_bucket_created_at ON object_favorites(profile_id, bucket, created_at);`,
	}

	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

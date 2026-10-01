package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateSQLiteSnapshot(t *testing.T) {
	st := newTestStore(t)
	_ = createTestProfile(t, st)
	path := filepath.Join(t.TempDir(), "snapshot.db")
	if err := st.CreateSQLiteBackup(t.Context(), path); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateSQLiteSnapshot(t.Context(), path); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(path)
	if err != nil || string(after) != string(before) {
		t.Fatal("validation wrote to the snapshot")
	}
	if err := st.db.Exec("ALTER TABLE jobs RENAME COLUMN payload_json TO obsolete_payload").Error; err != nil {
		t.Fatal(err)
	}
	if err := st.CreateSQLiteBackup(t.Context(), path); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSQLiteSnapshot(t.Context(), path); err == nil {
		t.Fatal("accepted an incompatible application schema")
	}
	if err := os.WriteFile(path, []byte("synthetic invalid sqlite"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSQLiteSnapshot(t.Context(), path); err == nil {
		t.Fatal("accepted an invalid database")
	}
}

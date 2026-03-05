package store

import (
	"bytes"
	"context"
	"encoding/base64"
	"path/filepath"
	"strings"
	"testing"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

func newProfileTestStore(t *testing.T, opts Options) *Store {
	t.Helper()
	dataDir := t.TempDir()
	gormDB, err := db.Open(db.Config{
		Backend:    db.BackendSQLite,
		SQLitePath: filepath.Join(dataDir, "s3desk.db"),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("open sql db: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	st, err := New(gormDB, opts)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return st
}

func createAzureProfile(t *testing.T, st *Store) models.Profile {
	t.Helper()
	accountName := "devstoreaccount1"
	accountKey := "Eby8vdM02xNo="
	endpoint := "http://127.0.0.1:10000/devstoreaccount1"
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderAzureBlob,
		Name:                  "azure",
		AccountName:           &accountName,
		AccountKey:            &accountKey,
		Endpoint:              &endpoint,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	return profile
}

func testStoreEncryptionKey() string {
	raw := bytes.Repeat([]byte{0x42}, 32)
	return base64.StdEncoding.EncodeToString(raw)
}

func TestListProfilesFailsOnCorruptedConfigJSON(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	profile := createAzureProfile(t, st)

	if err := st.db.WithContext(context.Background()).
		Model(&profileRow{}).
		Where("id = ?", profile.ID).
		Update("config_json", "{broken-json").Error; err != nil {
		t.Fatalf("corrupt config_json: %v", err)
	}

	_, err := st.ListProfiles(context.Background())
	if err == nil {
		t.Fatal("expected list profiles to fail on corrupted config_json")
	}
	if !strings.Contains(err.Error(), "invalid config_json") {
		t.Fatalf("expected invalid config_json error, got %v", err)
	}
	if !strings.Contains(err.Error(), profile.ID) {
		t.Fatalf("expected profile id in error, got %v", err)
	}
}

func TestGetProfileSecretsFailsOnCorruptedSecretsJSON(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	profile := createAzureProfile(t, st)

	if err := st.db.WithContext(context.Background()).
		Model(&profileRow{}).
		Where("id = ?", profile.ID).
		Update("secrets_json", "{broken-json").Error; err != nil {
		t.Fatalf("corrupt secrets_json: %v", err)
	}

	_, _, err := st.GetProfileSecrets(context.Background(), profile.ID)
	if err == nil {
		t.Fatal("expected GetProfileSecrets to fail on corrupted secrets_json")
	}
	if !strings.Contains(err.Error(), "invalid secrets_json") {
		t.Fatalf("expected invalid secrets_json error, got %v", err)
	}
	if !strings.Contains(err.Error(), profile.ID) {
		t.Fatalf("expected profile id in error, got %v", err)
	}
}

func TestEnsureProfilesEncryptedFailsOnCorruptedSecretsJSON(t *testing.T) {
	st := newProfileTestStore(t, Options{EncryptionKey: testStoreEncryptionKey()})
	profile := createAzureProfile(t, st)

	if err := st.db.WithContext(context.Background()).
		Model(&profileRow{}).
		Where("id = ?", profile.ID).
		Update("secrets_json", "{broken-json").Error; err != nil {
		t.Fatalf("corrupt secrets_json: %v", err)
	}

	_, err := st.EnsureProfilesEncrypted(context.Background())
	if err == nil {
		t.Fatal("expected EnsureProfilesEncrypted to fail on corrupted secrets_json")
	}
	if !strings.Contains(err.Error(), "invalid secrets_json") {
		t.Fatalf("expected invalid secrets_json error, got %v", err)
	}
	if !strings.Contains(err.Error(), profile.ID) {
		t.Fatalf("expected profile id in error, got %v", err)
	}
}

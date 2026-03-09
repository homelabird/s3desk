package store

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
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

func TestCreateProfileGcpRequiresProjectNumber(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	serviceAccountJSON := `{"type":"service_account","project_id":"p","client_email":"e","private_key":"k"}`

	_, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderGcpGcs,
		Name:                  "gcp",
		ServiceAccountJSON:    &serviceAccountJSON,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err == nil {
		t.Fatal("expected missing projectNumber error")
	}
	if !strings.Contains(err.Error(), "projectNumber is required") {
		t.Fatalf("expected projectNumber error, got %v", err)
	}
}

func TestUpdateProfileGcpRejectsEmptyProjectNumber(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	serviceAccountJSON := `{"type":"service_account","project_id":"p","client_email":"e","private_key":"k"}`
	projectNumber := "123456789012"

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderGcpGcs,
		Name:                  "gcp",
		ServiceAccountJSON:    &serviceAccountJSON,
		ProjectNumber:         &projectNumber,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	empty := ""
	_, ok, err := st.UpdateProfile(context.Background(), profile.ID, models.ProfileUpdateRequest{
		Provider:      models.ProfileProviderGcpGcs,
		ProjectNumber: &empty,
	})
	if !ok {
		t.Fatal("expected profile to exist")
	}
	if err == nil {
		t.Fatal("expected missing projectNumber error")
	}
	if !strings.Contains(err.Error(), "projectNumber is required") {
		t.Fatalf("expected projectNumber error, got %v", err)
	}
}

func TestCreateProfileOciDefaultsUserPrincipalAuth(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	region := "ap-tokyo-1"
	namespace := "nrszxupgigok"
	compartment := "ocid1.compartment.oc1..aaaaaaaaexample"
	endpoint := "https://objectstorage.ap-tokyo-1.oraclecloud.com"

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderOciObjectStorage,
		Name:                  "oci-native",
		Region:                &region,
		Namespace:             &namespace,
		Compartment:           &compartment,
		Endpoint:              &endpoint,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("CreateProfile() err = %v", err)
	}
	if profile.AuthProvider != "user_principal_auth" {
		t.Fatalf("profile authProvider=%q, want user_principal_auth", profile.AuthProvider)
	}

	secrets, ok, err := st.GetProfileSecrets(context.Background(), profile.ID)
	if err != nil || !ok {
		t.Fatalf("GetProfileSecrets() ok=%v err=%v", ok, err)
	}
	if secrets.OciAuthProvider != "user_principal_auth" {
		t.Fatalf("secrets authProvider=%q, want user_principal_auth", secrets.OciAuthProvider)
	}
}

func TestLegacyOciS3CompatProfilesNormalizeToS3Compatible(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	now := "2026-03-09T00:00:00Z"
	row := profileRow{
		ID:                    "legacy-oci-compat",
		Name:                  "legacy",
		Provider:              "oci_s3_compat",
		Endpoint:              "https://namespace.compat.objectstorage.ap-tokyo-1.oraclecloud.com",
		Region:                "ap-tokyo-1",
		ForcePathStyle:        0,
		PreserveLeadingSlash:  0,
		TLSInsecureSkipVerify: 0,
		AccessKeyID:           "ak",
		SecretAccessKey:       "sk",
		ConfigJSON:            "{}",
		SecretsJSON:           "{}",
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	if err := st.db.WithContext(context.Background()).Create(&row).Error; err != nil {
		t.Fatalf("insert legacy profile: %v", err)
	}

	profile, ok, err := st.GetProfile(context.Background(), row.ID)
	if err != nil || !ok {
		t.Fatalf("GetProfile() ok=%v err=%v", ok, err)
	}
	if profile.Provider != models.ProfileProviderS3Compatible {
		t.Fatalf("provider=%q, want %q", profile.Provider, models.ProfileProviderS3Compatible)
	}

	secrets, ok, err := st.GetProfileSecrets(context.Background(), row.ID)
	if err != nil || !ok {
		t.Fatalf("GetProfileSecrets() ok=%v err=%v", ok, err)
	}
	if secrets.Provider != models.ProfileProviderS3Compatible {
		t.Fatalf("secrets provider=%q, want %q", secrets.Provider, models.ProfileProviderS3Compatible)
	}

	updatedName := "legacy-updated"
	updatedEndpoint := "https://updated.example.com"
	updated, ok, err := st.UpdateProfile(context.Background(), row.ID, models.ProfileUpdateRequest{
		Provider: models.ProfileProviderS3Compatible,
		Name:     &updatedName,
		Endpoint: &updatedEndpoint,
	})
	if err != nil || !ok {
		t.Fatalf("UpdateProfile() ok=%v err=%v", ok, err)
	}
	if updated.Provider != models.ProfileProviderS3Compatible {
		t.Fatalf("updated provider=%q, want %q", updated.Provider, models.ProfileProviderS3Compatible)
	}

	var persisted profileRow
	if err := st.db.WithContext(context.Background()).Where("id = ?", row.ID).Take(&persisted).Error; err != nil {
		t.Fatalf("reload profile row: %v", err)
	}
	if persisted.Provider != string(models.ProfileProviderS3Compatible) {
		t.Fatalf("persisted provider=%q, want %q", persisted.Provider, models.ProfileProviderS3Compatible)
	}

	var cfg map[string]any
	if err := json.Unmarshal([]byte(persisted.ConfigJSON), &cfg); err != nil {
		t.Fatalf("decode config_json: %v", err)
	}
}

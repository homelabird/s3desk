package store

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"

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

func TestProfileExistsDoesNotDecodeProfile(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	profile := createAzureProfile(t, st)

	if err := st.db.WithContext(context.Background()).
		Model(&profileRow{}).
		Where("id = ?", profile.ID).
		Updates(map[string]any{
			"config_json":  "{broken-json",
			"secrets_json": "{broken-json",
		}).Error; err != nil {
		t.Fatalf("corrupt profile payloads: %v", err)
	}

	queries := 0
	const callback = "test:profile_exists_query_count"
	if err := st.db.Callback().Query().Before("gorm:query").Register(callback, func(*gorm.DB) {
		queries++
	}); err != nil {
		t.Fatalf("register query callback: %v", err)
	}
	t.Cleanup(func() { _ = st.db.Callback().Query().Remove(callback) })

	exists, err := st.ProfileExists(context.Background(), profile.ID)
	if err != nil || !exists {
		t.Fatalf("ProfileExists() existing = (%v, %v), want (true, nil)", exists, err)
	}
	if queries != 1 {
		t.Fatalf("queries=%d, want 1 for existing profile", queries)
	}

	queries = 0
	exists, err = st.ProfileExists(context.Background(), "missing-profile")
	if err != nil || exists {
		t.Fatalf("ProfileExists() missing = (%v, %v), want (false, nil)", exists, err)
	}
	if queries != 1 {
		t.Fatalf("queries=%d, want 1 for missing profile", queries)
	}
}

func TestGetProfileSecretsLoadsProfileAndTLSWithOneQuery(t *testing.T) {
	st := newProfileTestStore(t, Options{EncryptionKey: testStoreEncryptionKey()})
	profile := createAzureProfile(t, st)
	tlsConfig := models.ProfileTLSConfig{
		Mode:          models.ProfileTLSModeMTLS,
		ClientCertPEM: "client-cert",
		ClientKeyPEM:  "client-key",
		CACertPEM:     "ca-cert",
	}
	_, tlsUpdatedAt, err := st.UpsertProfileTLSConfig(context.Background(), profile.ID, tlsConfig)
	if err != nil {
		t.Fatalf("upsert tls config: %v", err)
	}

	queries := 0
	const callback = "test:get_profile_secrets_query_count"
	if err := st.db.Callback().Query().Before("gorm:query").Register(callback, func(*gorm.DB) {
		queries++
	}); err != nil {
		t.Fatalf("register query callback: %v", err)
	}
	t.Cleanup(func() { _ = st.db.Callback().Query().Remove(callback) })

	secrets, ok, err := st.GetProfileSecrets(context.Background(), profile.ID)
	if err != nil || !ok {
		t.Fatalf("GetProfileSecrets() ok=%v err=%v", ok, err)
	}
	if queries != 1 {
		t.Fatalf("queries=%d, want 1 with TLS config", queries)
	}
	if secrets.AzureAccountKey != "Eby8vdM02xNo=" {
		t.Fatalf("AzureAccountKey=%q, want decrypted key", secrets.AzureAccountKey)
	}
	if secrets.TLSConfig == nil || *secrets.TLSConfig != tlsConfig || secrets.TLSConfigUpdatedAt != tlsUpdatedAt {
		t.Fatalf("TLS config=%+v updatedAt=%q, want %+v updatedAt=%q", secrets.TLSConfig, secrets.TLSConfigUpdatedAt, tlsConfig, tlsUpdatedAt)
	}

	if _, err := st.DeleteProfileTLSConfig(context.Background(), profile.ID); err != nil {
		t.Fatalf("delete tls config: %v", err)
	}
	queries = 0
	secrets, ok, err = st.GetProfileSecrets(context.Background(), profile.ID)
	if err != nil || !ok || secrets.TLSConfig != nil {
		t.Fatalf("GetProfileSecrets() without TLS = (%+v, %v, %v)", secrets.TLSConfig, ok, err)
	}
	if queries != 1 {
		t.Fatalf("queries=%d, want 1 without TLS config", queries)
	}

	queries = 0
	_, ok, err = st.GetProfileSecrets(context.Background(), "missing-profile")
	if err != nil || ok {
		t.Fatalf("GetProfileSecrets() missing ok=%v err=%v", ok, err)
	}
	if queries != 1 {
		t.Fatalf("queries=%d, want 1 for missing profile", queries)
	}

	if _, _, err := st.UpsertProfileTLSConfig(context.Background(), profile.ID, tlsConfig); err != nil {
		t.Fatalf("restore tls config: %v", err)
	}
	if err := st.db.Model(&profileConnectionOptionsRow{}).
		Where("profile_id = ?", profile.ID).
		Update("schema_version", profileTLSConfigSchemaVersion+1).Error; err != nil {
		t.Fatalf("set unsupported tls schema: %v", err)
	}
	queries = 0
	if _, _, err := st.GetProfileSecrets(context.Background(), profile.ID); err == nil || !strings.Contains(err.Error(), "unsupported tls options schema version") {
		t.Fatalf("unsupported TLS schema error=%v", err)
	}
	if queries != 1 {
		t.Fatalf("queries=%d, want 1 for unsupported TLS schema", queries)
	}

	brokenOptions, err := st.crypto.encryptString("{broken-json")
	if err != nil {
		t.Fatalf("encrypt broken tls config: %v", err)
	}
	if err := st.db.Model(&profileConnectionOptionsRow{}).
		Where("profile_id = ?", profile.ID).
		Updates(map[string]any{
			"schema_version": profileTLSConfigSchemaVersion,
			"options_enc":    brokenOptions,
		}).Error; err != nil {
		t.Fatalf("set broken tls config: %v", err)
	}
	queries = 0
	if _, _, err := st.GetProfileSecrets(context.Background(), profile.ID); err == nil {
		t.Fatal("expected malformed TLS config error")
	}
	if queries != 1 {
		t.Fatalf("queries=%d, want 1 for malformed TLS config", queries)
	}
}

func TestDeleteProfileRejectsActiveJobs(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	profile := createAzureProfile(t, st)
	ctx := context.Background()
	job, err := st.CreateJob(ctx, profile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("CreateJob: %v", err)
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, job.ID, models.JobStatusRunning, &startedAt, nil, nil, nil, nil); err != nil {
		t.Fatalf("UpdateJobStatus: %v", err)
	}

	deleted, err := st.DeleteProfile(ctx, profile.ID)
	if !errors.Is(err, ErrProfileHasActiveJobs) {
		t.Fatalf("DeleteProfile() error=%v, want ErrProfileHasActiveJobs", err)
	}
	if deleted {
		t.Fatal("DeleteProfile() deleted profile with active job")
	}
	if _, ok, err := st.GetProfile(ctx, profile.ID); err != nil || !ok {
		t.Fatalf("GetProfile() = (_, %v, %v), want profile retained", ok, err)
	}
}

func TestDeleteProfileRejectsActiveUploadSessions(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	profile := createAzureProfile(t, st)
	if _, err := st.CreateUploadSession(context.Background(), profile.ID, "bucket", "prefix", "staging", "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("CreateUploadSession: %v", err)
	}

	deleted, err := st.DeleteProfile(context.Background(), profile.ID)
	if !errors.Is(err, ErrProfileHasActiveUploadSessions) {
		t.Fatalf("DeleteProfile() error=%v, want ErrProfileHasActiveUploadSessions", err)
	}
	if deleted {
		t.Fatal("DeleteProfile() deleted profile with active upload session")
	}
	if _, ok, err := st.GetProfile(context.Background(), profile.ID); err != nil || !ok {
		t.Fatalf("GetProfile() = (_, %v, %v), want profile retained", ok, err)
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

func TestEnsureProfilesEncryptedEncryptsAzureClientSecret(t *testing.T) {
	st := newProfileTestStore(t, Options{EncryptionKey: testStoreEncryptionKey()})
	profile := createAzureProfile(t, st)

	plainSecrets := `{"accountKey":"plain-account-key","clientSecret":"plain-client-secret"}`
	if err := st.db.WithContext(context.Background()).
		Model(&profileRow{}).
		Where("id = ?", profile.ID).
		Update("secrets_json", plainSecrets).Error; err != nil {
		t.Fatalf("seed plain secrets_json: %v", err)
	}

	updated, err := st.EnsureProfilesEncrypted(context.Background())
	if err != nil {
		t.Fatalf("EnsureProfilesEncrypted() error=%v", err)
	}
	if updated != 1 {
		t.Fatalf("updated=%d, want 1", updated)
	}

	var row profileRow
	if err := st.db.WithContext(context.Background()).
		Where("id = ?", profile.ID).
		Take(&row).Error; err != nil {
		t.Fatalf("load profile row: %v", err)
	}
	var stored map[string]string
	if err := json.Unmarshal([]byte(row.SecretsJSON), &stored); err != nil {
		t.Fatalf("decode stored secrets: %v", err)
	}
	for _, key := range []string{"accountKey", "clientSecret"} {
		if strings.Contains(stored[key], "plain-") {
			t.Fatalf("%s was not encrypted: %q", key, stored[key])
		}
		if !strings.HasPrefix(stored[key], encryptedPrefix) {
			t.Fatalf("%s=%q, want encrypted prefix", key, stored[key])
		}
	}

	secrets, ok, err := st.GetProfileSecrets(context.Background(), profile.ID)
	if !ok || err != nil {
		t.Fatalf("GetProfileSecrets() ok=%v err=%v", ok, err)
	}
	if secrets.AzureAccountKey != "plain-account-key" {
		t.Fatalf("AzureAccountKey=%q, want decrypted account key", secrets.AzureAccountKey)
	}
	if secrets.AzureClientSecret != "plain-client-secret" {
		t.Fatalf("AzureClientSecret=%q, want decrypted client secret", secrets.AzureClientSecret)
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

func TestCreateProfileGcpRejectsUnsafeServiceAccountTokenURI(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	serviceAccountJSON := `{"type":"service_account","project_id":"p","client_email":"e","private_key":"k","token_uri":"http://169.254.169.254/token"}`
	projectNumber := "123456789012"

	_, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:           models.ProfileProviderGcpGcs,
		Name:               "gcp",
		ServiceAccountJSON: &serviceAccountJSON,
		ProjectNumber:      &projectNumber,
	})
	if err == nil {
		t.Fatal("expected unsafe token_uri error")
	}
	if !strings.Contains(err.Error(), "token_uri") {
		t.Fatalf("expected token_uri error, got %v", err)
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

func TestUpdateProfileGcpRejectsUnsafeServiceAccountTokenURI(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	serviceAccountJSON := `{"type":"service_account","project_id":"p","client_email":"e","private_key":"k"}`
	projectNumber := "123456789012"

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:           models.ProfileProviderGcpGcs,
		Name:               "gcp",
		ServiceAccountJSON: &serviceAccountJSON,
		ProjectNumber:      &projectNumber,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	unsafeServiceAccountJSON := `{"type":"service_account","project_id":"p","client_email":"e","private_key":"k","token_uri":"http://169.254.169.254/token"}`
	_, ok, err := st.UpdateProfile(context.Background(), profile.ID, models.ProfileUpdateRequest{
		Provider:           models.ProfileProviderGcpGcs,
		ServiceAccountJSON: &unsafeServiceAccountJSON,
	})
	if !ok {
		t.Fatal("expected profile to exist")
	}
	if err == nil {
		t.Fatal("expected unsafe token_uri error")
	}
	if !strings.Contains(err.Error(), "token_uri") {
		t.Fatalf("expected token_uri error, got %v", err)
	}
}

func TestUpdateProfileRollsBackWhenReloadFails(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	testUpdateProfileRollsBackWhenReloadFails(t, st)
}

func testUpdateProfileRollsBackWhenReloadFails(t *testing.T, st *Store) {
	t.Helper()
	profile := createAzureProfile(t, st)
	ctx := context.Background()

	injectedErr := errors.New("injected profile reload failure")
	profileQueries := 0
	const callback = "test:fail_updated_profile_reload"
	if err := st.db.Callback().Query().Before("gorm:query").Register(callback, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "profiles" {
			profileQueries++
			if profileQueries == 2 {
				tx.AddError(injectedErr)
			}
		}
	}); err != nil {
		t.Fatalf("register query callback: %v", err)
	}
	callbackRegistered := true
	t.Cleanup(func() {
		if callbackRegistered {
			_ = st.db.Callback().Query().Remove(callback)
		}
	})

	updatedName := "azure-updated"
	if _, _, err := st.UpdateProfile(ctx, profile.ID, models.ProfileUpdateRequest{Name: &updatedName}); !errors.Is(err, injectedErr) {
		t.Fatalf("UpdateProfile() error=%v, want %v", err, injectedErr)
	}
	if err := st.db.Callback().Query().Remove(callback); err != nil {
		t.Fatalf("remove query callback: %v", err)
	}
	callbackRegistered = false

	got, ok, err := st.GetProfile(ctx, profile.ID)
	if err != nil || !ok {
		t.Fatalf("GetProfile() ok=%v err=%v", ok, err)
	}
	if got.Name != profile.Name {
		t.Fatalf("profile name=%q after failed update, want rollback to %q", got.Name, profile.Name)
	}
}

func TestUpdateProfileNamePreservesEncryptedCredentials(t *testing.T) {
	st := newProfileTestStore(t, Options{EncryptionKey: testStoreEncryptionKey()})
	endpoint := "http://127.0.0.1:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	sessionToken := "session"
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider: models.ProfileProviderS3Compatible, Name: "encrypted",
		Endpoint: &endpoint, Region: &region, AccessKeyID: &accessKey,
		SecretAccessKey: &secretKey, SessionToken: &sessionToken,
	})
	if err != nil {
		t.Fatalf("CreateProfile() error=%v", err)
	}

	var before profileRow
	if err := st.db.Where("id = ?", profile.ID).Take(&before).Error; err != nil {
		t.Fatalf("load profile before update: %v", err)
	}
	updatedName := "renamed"
	if _, ok, err := st.UpdateProfile(context.Background(), profile.ID, models.ProfileUpdateRequest{Name: &updatedName}); err != nil || !ok {
		t.Fatalf("UpdateProfile() ok=%v err=%v", ok, err)
	}
	var after profileRow
	if err := st.db.Where("id = ?", profile.ID).Take(&after).Error; err != nil {
		t.Fatalf("load profile after update: %v", err)
	}
	if after.AccessKeyID != before.AccessKeyID || after.SecretAccessKey != before.SecretAccessKey || before.SessionToken == nil || after.SessionToken == nil || *after.SessionToken != *before.SessionToken {
		t.Fatal("name-only update rewrote encrypted credentials")
	}
}

func TestUpdateProfileSerializesProviderConfigChanges(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	testUpdateProfileSerializesProviderConfigChanges(t, st)
}

func testUpdateProfileSerializesProviderConfigChanges(t *testing.T, st *Store) {
	t.Helper()
	profile := createAzureProfile(t, st)
	type contextKey struct{}
	key := contextKey{}

	firstRead := make(chan struct{})
	releaseFirst := make(chan struct{})
	secondUpdate := make(chan struct{})
	releaseSecond := make(chan struct{})
	var firstOnce, secondOnce sync.Once
	const (
		queryCallback  = "test:block_first_profile_update_read"
		updateCallback = "test:block_second_profile_update_write"
	)
	if err := st.db.Callback().Query().After("gorm:query").Register(queryCallback, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "profiles" && tx.Statement.Context.Value(key) == "first" {
			firstOnce.Do(func() {
				close(firstRead)
				<-releaseFirst
			})
		}
	}); err != nil {
		t.Fatalf("register query callback: %v", err)
	}
	if err := st.db.Callback().Update().Before("gorm:update").Register(updateCallback, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "profiles" && tx.Statement.Context.Value(key) == "second" {
			secondOnce.Do(func() {
				close(secondUpdate)
				<-releaseSecond
			})
		}
	}); err != nil {
		t.Fatalf("register update callback: %v", err)
	}
	t.Cleanup(func() {
		_ = st.db.Callback().Query().Remove(queryCallback)
		_ = st.db.Callback().Update().Remove(updateCallback)
	})

	firstDone := make(chan error, 1)
	accountName := "updated-account"
	go func() {
		_, _, err := st.UpdateProfile(context.WithValue(context.Background(), key, "first"), profile.ID, models.ProfileUpdateRequest{AccountName: &accountName})
		firstDone <- err
	}()
	<-firstRead

	secondDone := make(chan error, 1)
	endpoint := "http://127.0.0.1:10001/updated-account"
	go func() {
		_, _, err := st.UpdateProfile(context.WithValue(context.Background(), key, "second"), profile.ID, models.ProfileUpdateRequest{Endpoint: &endpoint})
		secondDone <- err
	}()
	<-secondUpdate

	close(releaseFirst)
	if err := <-firstDone; err != nil {
		t.Fatalf("first UpdateProfile() error=%v", err)
	}
	close(releaseSecond)
	if err := <-secondDone; err != nil {
		t.Fatalf("second UpdateProfile() error=%v", err)
	}

	got, ok, err := st.GetProfile(context.Background(), profile.ID)
	if err != nil || !ok {
		t.Fatalf("GetProfile() ok=%v err=%v", ok, err)
	}
	if got.AccountName != accountName || got.Endpoint != endpoint {
		t.Fatalf("provider config=(accountName=%q endpoint=%q), want (%q %q)", got.AccountName, got.Endpoint, accountName, endpoint)
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

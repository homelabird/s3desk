package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"

	"s3desk/internal/models"
)

func TestPortableImportEncryptsPlaintextCredentials(t *testing.T) {
	testPortableImportEncryptsPlaintextCredentials(t, newProfileTestStore(t, Options{EncryptionKey: testStoreEncryptionKey()}))
}

func testPortableImportEncryptsPlaintextCredentials(t *testing.T, target *Store) {
	t.Helper()
	source := newTestStore(t)
	s3 := createTestProfile(t, source)
	if err := source.db.Model(&profileRow{}).Where("id = ?", s3.ID).Update("session_token", "portable fixture").Error; err != nil {
		t.Fatal(err)
	}
	azure := createAzureProfile(t, source)
	serviceAccount := `{"type":"service_account","project_id":"portable","client_email":"fixture@example.invalid","private_key":"synthetic fixture","token_uri":"https://oauth2.googleapis.com/token"}`
	projectNumber := "1234"
	gcs, err := source.CreateProfile(t.Context(), models.ProfileCreateRequest{Provider: models.ProfileProviderGcpGcs, Name: "portable-gcs", ProjectNumber: &projectNumber, ServiceAccountJSON: &serviceAccount})
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := source.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{}
	for name, file := range bundle.EntityFiles {
		files[name] = file.Data
	}
	createTestProfile(t, target)
	const callback = "test:require_encryption_before_sql"
	checked := 0
	if err := target.db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if tx.Statement.Table != "profiles" {
			return
		}
		for i := 0; i < tx.Statement.ReflectValue.Len(); i++ {
			row := tx.Statement.ReflectValue.Index(i).Interface().(profileRow)
			if isS3LikeProvider(models.ProfileProvider(row.Provider)) {
				if !strings.HasPrefix(row.AccessKeyID, encryptedPrefix) || !strings.HasPrefix(row.SecretAccessKey, encryptedPrefix) || row.SessionToken == nil || !strings.HasPrefix(*row.SessionToken, encryptedPrefix) {
					t.Fatal("plaintext S3 credentials reached SQL")
				}
			} else {
				var secrets map[string]string
				if err := json.Unmarshal([]byte(row.SecretsJSON), &secrets); err != nil {
					t.Fatal(err)
				}
				for _, value := range secrets {
					if value != "" && !strings.HasPrefix(value, encryptedPrefix) {
						t.Fatal("plaintext provider credentials reached SQL")
					}
				}
			}
			checked++
		}
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = target.db.Callback().Create().Remove(callback) })
	if _, err := target.ImportPortableEntityFilesReplace(t.Context(), files, t.TempDir()); err != nil {
		t.Fatal(err)
	}
	if checked != 3 {
		t.Fatalf("encrypted rows checked before SQL=%d, want 3", checked)
	}
	for _, profile := range []models.Profile{s3, azure, gcs} {
		var row profileRow
		if err := target.db.Where("id = ?", profile.ID).Take(&row).Error; err != nil {
			t.Fatal(err)
		}
		if profile.ID == s3.ID {
			if !strings.HasPrefix(row.AccessKeyID, encryptedPrefix) || !strings.HasPrefix(row.SecretAccessKey, encryptedPrefix) {
				t.Fatal("imported S3 credentials remain plaintext at rest")
			}
		} else if profile.ID == azure.ID {
			var secrets azureProfileSecrets
			if err := json.Unmarshal([]byte(row.SecretsJSON), &secrets); err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(secrets.AccountKey, encryptedPrefix) {
				t.Fatal("imported Azure credentials remain plaintext at rest")
			}
		} else {
			var secrets gcpProfileSecrets
			if err := json.Unmarshal([]byte(row.SecretsJSON), &secrets); err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(secrets.ServiceAccountJSON, encryptedPrefix) {
				t.Fatal("imported GCS credentials remain plaintext at rest")
			}
		}
		want, _, err := source.GetProfileSecrets(t.Context(), profile.ID)
		if err != nil {
			t.Fatal(err)
		}
		got, ok, err := target.GetProfileSecrets(t.Context(), profile.ID)
		if err != nil || !ok || got.AccessKeyID != want.AccessKeyID || got.SecretAccessKey != want.SecretAccessKey || got.AzureAccountKey != want.AzureAccountKey || got.GcpServiceAccountJSON != want.GcpServiceAccountJSON {
			t.Fatal("imported credentials could not be read back correctly")
		}
		if want.SessionToken != nil && (got.SessionToken == nil || *got.SessionToken != *want.SessionToken) {
			t.Fatal("imported session credential value changed")
		}
	}
}

func TestPortableEncryptedGCSValidation(t *testing.T) {
	key := testStoreEncryptionKey()
	crypto, err := newProfileCrypto(key)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, key, plaintext string
		valid                bool
	}{
		{"valid", key, `{"token_uri":"https://oauth2.googleapis.com/token"}`, true},
		{"missing key", "", `{"token_uri":"https://oauth2.googleapis.com/token"}`, false},
		{"wrong key", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("C", 32))), `{"token_uri":"https://oauth2.googleapis.com/token"}`, false},
		{"unsafe token URI", key, `{"token_uri":"http://169.254.169.254/token"}`, false},
		{"empty required credentials", key, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			encrypted, err := crypto.encryptString(tc.plaintext)
			if err != nil {
				t.Fatal(err)
			}
			secrets, err := json.Marshal(gcpProfileSecrets{ServiceAccountJSON: encrypted})
			if err != nil {
				t.Fatal(err)
			}
			file := marshalPortableEntityFile("profiles", []profileRow{{ID: ulid.Make().String(), Provider: string(models.ProfileProviderGcpGcs), ConfigJSON: `{"projectNumber":"1234"}`, SecretsJSON: string(secrets)}})
			err = ValidatePortableEntityFilesWithOptions(t.TempDir(), map[string][]byte{"profiles": file.Data}, PortableValidationOptions{EncryptionKey: tc.key})
			if (err == nil) != tc.valid {
				t.Fatalf("validation accepted=%v, want %v", err == nil, tc.valid)
			}
		})
	}
}

func TestExportPortableEntityFilesUsesConsistentSnapshot(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "s3desk.db")
	reader := newTestStoreAt(t, dbPath)
	writer := newTestStoreAt(t, dbPath)
	profile := createTestProfile(t, reader)
	ctx := context.Background()

	var once sync.Once
	var writeErr error
	if err := reader.db.Callback().Query().After("gorm:query").Register("test:insert_job_after_profiles", func(tx *gorm.DB) {
		if tx.Statement.Table == "profiles" {
			once.Do(func() {
				_, writeErr = writer.CreateJob(ctx, profile.ID, CreateJobInput{Type: "snapshot-probe", Payload: map[string]any{}})
			})
		}
	}); err != nil {
		t.Fatalf("register query callback: %v", err)
	}

	bundle, err := reader.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	if writeErr != nil {
		t.Fatalf("insert concurrent job: %v", writeErr)
	}
	jobs, err := parsePortableRows[jobRow](bundle.EntityFiles["jobs"].Data)
	if err != nil {
		t.Fatalf("parse exported jobs: %v", err)
	}
	if len(jobs) != 0 {
		t.Fatalf("exported jobs=%d, want snapshot before concurrent insert", len(jobs))
	}
	ids, err := writer.ListJobIDsByProfile(ctx, profile.ID)
	if err != nil {
		t.Fatalf("list persisted jobs: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("persisted jobs=%d, want concurrent insert committed", len(ids))
	}
}

func TestImportPortableEntityFilesReplaceRollsBackOnInsertFailure(t *testing.T) {
	ctx := context.Background()
	source := newTestStore(t)
	createTestProfile(t, source)
	bundle, err := source.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export source entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}

	destination := newTestStore(t)
	original := createTestProfile(t, destination)
	if err := destination.db.Exec(`CREATE TRIGGER fail_portable_profile_insert BEFORE INSERT ON profiles BEGIN SELECT RAISE(ABORT, 'forced insert failure'); END;`).Error; err != nil {
		t.Fatalf("create failure trigger: %v", err)
	}
	if _, err := destination.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir()); err == nil {
		t.Fatal("expected forced insert failure")
	}
	got, ok, err := destination.GetProfile(ctx, original.ID)
	if err != nil {
		t.Fatalf("get original profile after rollback: %v", err)
	}
	if !ok || got.ID != original.ID {
		t.Fatalf("original profile after rollback=%+v, ok=%v", got, ok)
	}
}

func TestPortableRecoveryCapturesPreimageBeforeDeleteAndAbortsOnFailure(t *testing.T) {
	for _, failure := range []string{"backup", "cancel", "insert", "none"} {
		t.Run(failure, func(t *testing.T) {
			source := newTestStore(t)
			incoming := createTestProfile(t, source)
			bundle, err := source.ExportPortableEntityFiles(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			files := map[string][]byte{}
			for name, file := range bundle.EntityFiles {
				files[name] = file.Data
			}
			target := newTestStore(t)
			original := createTestProfile(t, target)
			if failure == "insert" {
				if err := target.db.Exec(`CREATE TRIGGER fail_recovery_insert BEFORE INSERT ON profiles BEGIN SELECT RAISE(ABORT, 'forced insert failure'); END;`).Error; err != nil {
					t.Fatal(err)
				}
			}
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			called := false
			_, err = target.ImportPortableEntityFilesReplaceWithRecovery(ctx, files, t.TempDir(), PortableValidationOptions{}, func(before PortableExportBundle) error {
				called = true
				rows, err := parsePortableRows[profileRow](before.EntityFiles["profiles"].Data)
				if err != nil || len(rows) != 1 || rows[0].ID != original.ID {
					t.Fatalf("preimage was not destination state: %v", err)
				}
				if failure == "backup" {
					return errors.New("forced backup write failure")
				}
				if failure == "cancel" {
					cancel()
				}
				return nil
			})
			if !called || (err == nil) != (failure == "none") {
				t.Fatalf("called=%v error=%v", called, err)
			}
			_, oldExists, err := target.GetProfile(t.Context(), original.ID)
			if err != nil || oldExists != (failure != "none") {
				t.Fatalf("old profile exists=%v error=%v", oldExists, err)
			}
			_, newExists, err := target.GetProfile(t.Context(), incoming.ID)
			if err != nil || newExists != (failure == "none") {
				t.Fatalf("new profile exists=%v error=%v", newExists, err)
			}
		})
	}
}

func TestPortableRecoveryRejectsDestinationLocalUploadBeforeCapture(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	bundle, err := st.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{}
	for name, file := range bundle.EntityFiles {
		files[name] = file.Data
	}
	if err := st.db.Create(&uploadSessionRow{ID: ulid.Make().String(), ProfileID: profile.ID, Mode: "staging", Bucket: "bucket-a", CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), ExpiresAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)}).Error; err != nil {
		t.Fatal(err)
	}
	called := false
	_, err = st.ImportPortableEntityFilesReplaceWithRecovery(t.Context(), files, t.TempDir(), PortableValidationOptions{}, func(PortableExportBundle) error { called = true; return nil })
	if !errors.Is(err, ErrPortableImportLocalUploads) || called {
		t.Fatalf("error=%v captured=%v", err, called)
	}
	if _, ok, err := st.GetProfile(t.Context(), profile.ID); err != nil || !ok {
		t.Fatal("blocked import changed destination")
	}
}

func TestPortableRoundTripIncludesObjectIndexReplacements(t *testing.T) {
	ctx := context.Background()
	source := newTestStore(t)
	profile := createTestProfile(t, source)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	want := objectIndexReplacementRow{
		ReplacementID: ulid.Make().String(),
		ProfileID:     profile.ID,
		Bucket:        "bucket-a",
		ObjectKey:     "pending/object.txt",
		Size:          42,
		IndexedAt:     now,
	}
	rows := make([]objectIndexReplacementRow, 251)
	rows[0] = want
	for i := 1; i < len(rows); i++ {
		rows[i] = want
		rows[i].ObjectKey = "pending/" + ulid.Make().String()
	}
	if err := source.db.CreateInBatches(rows, 250).Error; err != nil {
		t.Fatalf("seed object index replacement: %v", err)
	}
	bundle, err := source.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	if bundle.EntityFiles["object_index_replacements"].Count != len(rows) {
		t.Fatalf("exported replacement count=%d, want %d", bundle.EntityFiles["object_index_replacements"].Count, len(rows))
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}

	destination := newTestStore(t)
	counts, err := destination.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err != nil {
		t.Fatalf("import portable entities: %v", err)
	}
	if counts.ObjectIndexReplacements != len(rows) {
		t.Fatalf("imported replacement count=%d, want %d", counts.ObjectIndexReplacements, len(rows))
	}
	var got objectIndexReplacementRow
	if err := destination.db.Where("replacement_id = ? AND profile_id = ? AND bucket = ? AND object_key = ?", want.ReplacementID, want.ProfileID, want.Bucket, want.ObjectKey).Take(&got).Error; err != nil {
		t.Fatalf("load imported object index replacement: %v", err)
	}
	if got.ReplacementID != want.ReplacementID || got.ObjectKey != want.ObjectKey || got.Size != want.Size {
		t.Fatalf("imported replacement=%+v, want %+v", got, want)
	}
}

func TestImportPortableEntityFilesReplaceRejectsUnsafeJobIDs(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	entityFiles["jobs"] = marshalPortableEntityFile("jobs", []jobRow{
		{
			ID:          "../escape",
			ProfileID:   profile.ID,
			Type:        "s3.delete_objects",
			Status:      "queued",
			PayloadJSON: "{}",
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected unsafe job id import to fail")
	}
	if !strings.Contains(err.Error(), "invalid portable job id") {
		t.Fatalf("error=%v, want invalid portable job id", err)
	}
}

func TestImportPortableEntityFilesReplaceRejectsUnsafeProfileIDs(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	entityFiles["profiles"] = marshalPortableEntityFile("profiles", []profileRow{
		{
			ID:             "../escape",
			Name:           profile.Name,
			Provider:       string(profile.Provider),
			ConfigJSON:     "{}",
			SecretsJSON:    "{}",
			CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
			UpdatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
			ForcePathStyle: 1,
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected unsafe profile id import to fail")
	}
	if !strings.Contains(err.Error(), "invalid portable profile id") {
		t.Fatalf("error=%v, want invalid portable profile id", err)
	}
}

func TestImportPortableEntityFilesReplaceRejectsMissingProfileReferences(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	missingProfileID := ulid.Make().String()
	entityFiles["jobs"] = marshalPortableEntityFile("jobs", []jobRow{
		{
			ID:          ulid.Make().String(),
			ProfileID:   missingProfileID,
			Type:        "object_index",
			Status:      string(models.JobStatusSucceeded),
			PayloadJSON: "{}",
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected missing profile reference import to fail")
	}
	if !strings.Contains(err.Error(), "portable jobs profile id at row 1 references missing profile") {
		t.Fatalf("error=%v, want missing portable jobs profile reference", err)
	}

	got, ok, err := st.GetProfile(ctx, profile.ID)
	if err != nil {
		t.Fatalf("get profile after rejected import: %v", err)
	}
	if !ok || got.ID != profile.ID {
		t.Fatalf("profile after rejected import = %+v, ok=%v; want original profile", got, ok)
	}
}

func TestImportPortableEntityFilesReplaceRejectsMultipartRowsMissingUploadSession(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	uploadID := ulid.Make().String()
	entityFiles["upload_multipart_uploads"] = marshalPortableEntityFile("upload_multipart_uploads", []uploadMultipartRow{
		{
			UploadID:   uploadID,
			ProfileID:  profile.ID,
			Path:       "file.bin",
			Bucket:     "bucket-a",
			ObjectKey:  "incoming/file.bin",
			S3UploadID: "s3-upload-id",
			ChunkSize:  5 << 20,
			FileSize:   10 << 20,
			CreatedAt:  time.Now().UTC().Format(time.RFC3339Nano),
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339Nano),
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected missing upload session import to fail")
	}
	if !strings.Contains(err.Error(), "portable upload_multipart_uploads row 1 references missing upload session") {
		t.Fatalf("error=%v, want missing upload session", err)
	}
}

func TestImportPortableEntityFilesReplaceRejectsUploadObjectsOutsideSessionPrefix(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	uploadID := ulid.Make().String()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	entityFiles["upload_sessions"] = marshalPortableEntityFile("upload_sessions", []uploadSessionRow{
		{
			ID:        uploadID,
			ProfileID: profile.ID,
			Bucket:    "bucket-a",
			Prefix:    "incoming/",
			Mode:      "direct",
			ExpiresAt: now,
			CreatedAt: now,
		},
	}).Data
	entityFiles["upload_objects"] = marshalPortableEntityFile("upload_objects", []uploadObjectRow{
		{
			UploadID:  uploadID,
			ProfileID: profile.ID,
			Path:      "file.bin",
			Bucket:    "bucket-a",
			ObjectKey: "outside/file.bin",
			CreatedAt: now,
			UpdatedAt: now,
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected upload object outside session prefix import to fail")
	}
	if !strings.Contains(err.Error(), `object key "outside/file.bin" is outside upload session prefix "incoming/"`) {
		t.Fatalf("error=%v, want upload session prefix validation failure", err)
	}
}

func TestPortableObjectKeyMatchesUploadPrefixBoundary(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		objectKey string
		prefix    string
		want      bool
	}{
		{name: "empty prefix allows any key", objectKey: "anything/file.bin", prefix: "", want: true},
		{name: "exact object key", objectKey: "incoming", prefix: "incoming", want: true},
		{name: "slash bounded child", objectKey: "incoming/file.bin", prefix: "incoming", want: true},
		{name: "trailing slash child", objectKey: "incoming/file.bin", prefix: "incoming/", want: true},
		{name: "sibling prefix rejected", objectKey: "incoming-file.bin", prefix: "incoming", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := portableObjectKeyMatchesUploadPrefix(tc.objectKey, tc.prefix); got != tc.want {
				t.Fatalf("portableObjectKeyMatchesUploadPrefix(%q, %q)=%v, want %v", tc.objectKey, tc.prefix, got, tc.want)
			}
		})
	}
}

func TestImportPortableEntityFilesReplaceRejectsInvalidPortableProfileProvider(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	entityFiles["profiles"] = marshalPortableEntityFile("profiles", []profileRow{
		{
			ID:              profile.ID,
			Name:            profile.Name,
			Provider:        "ftp_storage",
			ConfigJSON:      "{}",
			SecretsJSON:     "{}",
			Endpoint:        "https://example.invalid",
			Region:          "us-east-1",
			AccessKeyID:     "access-key",
			SecretAccessKey: "secret-key",
			CreatedAt:       time.Now().UTC().Format(time.RFC3339Nano),
			UpdatedAt:       time.Now().UTC().Format(time.RFC3339Nano),
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected invalid provider import to fail")
	}
	if !strings.Contains(err.Error(), "unsupported provider") {
		t.Fatalf("error=%v, want unsupported provider", err)
	}
}

func TestImportPortableEntityFilesReplaceNormalizesLegacyProfileProvider(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	profiles, err := parsePortableRows[profileRow](entityFiles["profiles"])
	if err != nil {
		t.Fatalf("parse exported profiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("len(profiles)=%d, want 1", len(profiles))
	}
	profiles[0].Provider = "oci_s3_compat"
	entityFiles["profiles"] = marshalPortableEntityFile("profiles", profiles).Data

	if _, err := st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir()); err != nil {
		t.Fatalf("import portable entities: %v", err)
	}

	var persisted profileRow
	if err := st.db.WithContext(ctx).Where("id = ?", profile.ID).First(&persisted).Error; err != nil {
		t.Fatalf("load persisted profile row: %v", err)
	}
	if persisted.Provider != string(models.ProfileProviderS3Compatible) {
		t.Fatalf("persisted provider=%q, want %q", persisted.Provider, models.ProfileProviderS3Compatible)
	}
}

func TestImportPortableEntityFilesReplaceRejectsMalformedProviderConfig(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	entityFiles["profiles"] = marshalPortableEntityFile("profiles", []profileRow{
		{
			ID:          profile.ID,
			Name:        profile.Name,
			Provider:    string(models.ProfileProviderAzureBlob),
			ConfigJSON:  "{",
			SecretsJSON: `{"accountKey":"secret-key"}`,
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
			UpdatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected malformed provider config import to fail")
	}
	if !strings.Contains(err.Error(), "config_json") {
		t.Fatalf("error=%v, want config_json validation failure", err)
	}
}

func TestImportPortableEntityFilesReplaceRejectsUnsafeGcpServiceAccountTokenURI(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	entityFiles["profiles"] = marshalPortableEntityFile("profiles", []profileRow{
		{
			ID:          profile.ID,
			Name:        profile.Name,
			Provider:    string(models.ProfileProviderGcpGcs),
			ConfigJSON:  `{"projectNumber":"123456789012"}`,
			SecretsJSON: `{"serviceAccountJson":"{\"client_email\":\"demo@example.test\",\"private_key\":\"placeholder\",\"token_uri\":\"http://169.254.169.254/token\"}"}`,
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
			UpdatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		},
	}).Data

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected unsafe gcp token_uri import to fail")
	}
	if !strings.Contains(err.Error(), "token_uri") {
		t.Fatalf("error=%v, want token_uri validation failure", err)
	}
}

func TestImportPortableEntityFilesReplaceRejectsUnsafePortableProfileEndpoints(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		row     func(models.Profile, string) profileRow
		wantErr string
	}{
		{
			name: "s3 compatible metadata endpoint",
			row: func(profile models.Profile, now string) profileRow {
				return profileRow{
					ID:              profile.ID,
					Name:            profile.Name,
					Provider:        string(models.ProfileProviderS3Compatible),
					ConfigJSON:      "{}",
					SecretsJSON:     "{}",
					Endpoint:        "http://169.254.169.254/latest/meta-data",
					Region:          "us-east-1",
					AccessKeyID:     "access-key",
					SecretAccessKey: "secret-key",
					CreatedAt:       now,
					UpdatedAt:       now,
				}
			},
			wantErr: "blocked metadata host",
		},
		{
			name: "s3 public endpoint query string",
			row: func(profile models.Profile, now string) profileRow {
				return profileRow{
					ID:              profile.ID,
					Name:            profile.Name,
					Provider:        string(models.ProfileProviderS3Compatible),
					ConfigJSON:      "{}",
					SecretsJSON:     "{}",
					Endpoint:        "http://127.0.0.1:9000",
					PublicEndpoint:  "https://127.0.0.1:9001?token=secret",
					Region:          "us-east-1",
					AccessKeyID:     "access-key",
					SecretAccessKey: "secret-key",
					CreatedAt:       now,
					UpdatedAt:       now,
				}
			},
			wantErr: "query string",
		},
		{
			name: "azure metadata endpoint",
			row: func(profile models.Profile, now string) profileRow {
				return profileRow{
					ID:          profile.ID,
					Name:        profile.Name,
					Provider:    string(models.ProfileProviderAzureBlob),
					ConfigJSON:  `{"accountName":"acct","endpoint":"http://169.254.169.254/devstoreaccount1"}`,
					SecretsJSON: `{"accountKey":"secret-key"}`,
					CreatedAt:   now,
					UpdatedAt:   now,
				}
			},
			wantErr: "blocked metadata host",
		},
		{
			name: "gcp metadata endpoint",
			row: func(profile models.Profile, now string) profileRow {
				return profileRow{
					ID:          profile.ID,
					Name:        profile.Name,
					Provider:    string(models.ProfileProviderGcpGcs),
					ConfigJSON:  `{"projectNumber":"123456789012","anonymous":true,"endpoint":"http://169.254.169.254/storage/v1"}`,
					SecretsJSON: "{}",
					CreatedAt:   now,
					UpdatedAt:   now,
				}
			},
			wantErr: "blocked metadata host",
		},
		{
			name: "oci metadata endpoint",
			row: func(profile models.Profile, now string) profileRow {
				return profileRow{
					ID:          profile.ID,
					Name:        profile.Name,
					Provider:    string(models.ProfileProviderOciObjectStorage),
					ConfigJSON:  `{"region":"ap-tokyo-1","namespace":"namespace","compartment":"ocid1.compartment.oc1..example","endpoint":"http://169.254.169.254/object"}`,
					SecretsJSON: "{}",
					CreatedAt:   now,
					UpdatedAt:   now,
				}
			},
			wantErr: "blocked metadata host",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			st := newTestStore(t)
			profile := createTestProfile(t, st)
			ctx := context.Background()
			bundle, err := st.ExportPortableEntityFiles(ctx)
			if err != nil {
				t.Fatalf("export portable entities: %v", err)
			}
			entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
			for name, file := range bundle.EntityFiles {
				entityFiles[name] = file.Data
			}
			now := time.Now().UTC().Format(time.RFC3339Nano)
			entityFiles["profiles"] = marshalPortableEntityFile("profiles", []profileRow{tc.row(profile, now)}).Data

			_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
			if err == nil {
				t.Fatal("expected unsafe endpoint import to fail")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("error=%v, want %q", err, tc.wantErr)
			}
		})
	}
}

func TestValidatePortableEntityFilesWithOptionsAppliesAllowRemoteEndpointPolicy(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC().Format(time.RFC3339Nano)
	entityFiles := map[string][]byte{
		"profiles": marshalPortableEntityFile("profiles", []profileRow{
			{
				ID:              ulid.Make().String(),
				Name:            "local-minio",
				Provider:        string(models.ProfileProviderS3Compatible),
				ConfigJSON:      "{}",
				SecretsJSON:     "{}",
				Endpoint:        "http://localhost:9000",
				Region:          "us-east-1",
				AccessKeyID:     "access-key",
				SecretAccessKey: "secret-key",
				CreatedAt:       now,
				UpdatedAt:       now,
			},
		}).Data,
	}

	if err := ValidatePortableEntityFiles(t.TempDir(), entityFiles); err != nil {
		t.Fatalf("ValidatePortableEntityFiles() unexpected error: %v", err)
	}
	err := ValidatePortableEntityFilesWithOptions(t.TempDir(), entityFiles, PortableValidationOptions{AllowRemote: true})
	if err == nil {
		t.Fatal("expected localhost endpoint to fail when remote access is enabled")
	}
	if !strings.Contains(err.Error(), "must not target localhost") {
		t.Fatalf("error=%v, want localhost rejection", err)
	}
}

func TestValidatePortableEntityFilesRejectsTLSSkipVerifyWithoutPortableEndpoint(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC().Format(time.RFC3339Nano)
	entityFiles := map[string][]byte{
		"profiles": marshalPortableEntityFile("profiles", []profileRow{
			{
				ID:                    ulid.Make().String(),
				Name:                  "aws-default-endpoint",
				Provider:              string(models.ProfileProviderAwsS3),
				ConfigJSON:            "{}",
				SecretsJSON:           "{}",
				Region:                "us-east-1",
				AccessKeyID:           "access-key",
				SecretAccessKey:       "secret-key",
				TLSInsecureSkipVerify: 1,
				CreatedAt:             now,
				UpdatedAt:             now,
			},
		}).Data,
	}

	err := ValidatePortableEntityFiles(t.TempDir(), entityFiles)
	if err == nil {
		t.Fatal("expected tlsInsecureSkipVerify without custom endpoint to fail")
	}
	if !strings.Contains(err.Error(), "custom https:// endpoint") {
		t.Fatalf("error=%v, want custom endpoint rejection", err)
	}
}

func TestImportPortableEntityFilesReplaceRejectsUnknownPortableEntityFields(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}
	entityFiles["jobs"] = []byte(`{"ID":"` + ulid.Make().String() + `","ProfileID":"` + profile.ID + `","Type":"object_index","Status":"succeeded","PayloadJSON":"{}","CreatedAt":"` + time.Now().UTC().Format(time.RFC3339Nano) + `","UnexpectedColumn":"silently ignored"}` + "\n")

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected unknown portable entity field import to fail")
	}
	if !strings.Contains(err.Error(), "parse jobs") || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("error=%v, want parse jobs unknown field failure", err)
	}

	got, ok, err := st.GetProfile(ctx, profile.ID)
	if err != nil {
		t.Fatalf("get profile after rejected import: %v", err)
	}
	if !ok || got.ID != profile.ID {
		t.Fatalf("profile after rejected import = %+v, ok=%v; want original profile", got, ok)
	}
}

func TestImportPortableEntityFilesReplaceRejectsActiveDestinationJobs(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}

	if _, err := st.CreateJob(ctx, profile.ID, CreateJobInput{
		Type:    "transfer_delete_prefix",
		Payload: map[string]any{"bucket": "bucket-a", "prefix": "incoming/"},
	}); err != nil {
		t.Fatalf("create active destination job: %v", err)
	}

	_, err = st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir())
	if err == nil {
		t.Fatal("expected active destination job import to fail")
	}
	if !errors.Is(err, ErrPortableImportActiveJobs) {
		t.Fatalf("error=%v, want ErrPortableImportActiveJobs", err)
	}

	got, ok, err := st.GetProfile(ctx, profile.ID)
	if err != nil {
		t.Fatalf("get profile after rejected import: %v", err)
	}
	if !ok || got.ID != profile.ID {
		t.Fatalf("profile after rejected import = %+v, ok=%v; want original profile", got, ok)
	}
}

func TestImportPortableEntityFilesReplaceQuarantinesExecutableJobs(t *testing.T) {
	t.Parallel()

	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	bundle, err := st.ExportPortableEntityFiles(ctx)
	if err != nil {
		t.Fatalf("export portable entities: %v", err)
	}
	entityFiles := make(map[string][]byte, len(bundle.EntityFiles))
	for name, file := range bundle.EntityFiles {
		entityFiles[name] = file.Data
	}

	startedAt := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339Nano)
	succeededAt := time.Now().UTC().Format(time.RFC3339Nano)
	queuedID := ulid.Make().String()
	runningID := ulid.Make().String()
	succeededID := ulid.Make().String()
	entityFiles["jobs"] = marshalPortableEntityFile("jobs", []jobRow{
		{
			ID:          queuedID,
			ProfileID:   profile.ID,
			Type:        "transfer_delete_prefix",
			Status:      string(models.JobStatusQueued),
			PayloadJSON: "{}",
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		},
		{
			ID:          runningID,
			ProfileID:   profile.ID,
			Type:        "transfer_copy",
			Status:      string(models.JobStatusRunning),
			PayloadJSON: "{}",
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
			StartedAt:   &startedAt,
		},
		{
			ID:          succeededID,
			ProfileID:   profile.ID,
			Type:        "object_index",
			Status:      string(models.JobStatusSucceeded),
			PayloadJSON: "{}",
			CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
			FinishedAt:  &succeededAt,
		},
	}).Data

	if _, err := st.ImportPortableEntityFilesReplace(ctx, entityFiles, t.TempDir()); err != nil {
		t.Fatalf("import portable entities: %v", err)
	}

	queuedIDs, err := st.ListJobIDsByStatus(ctx, models.JobStatusQueued)
	if err != nil {
		t.Fatalf("list queued jobs: %v", err)
	}
	if len(queuedIDs) != 0 {
		t.Fatalf("queuedIDs=%v, want none after portable import quarantine", queuedIDs)
	}
	runningIDs, err := st.ListJobIDsByStatus(ctx, models.JobStatusRunning)
	if err != nil {
		t.Fatalf("list running jobs: %v", err)
	}
	if len(runningIDs) != 0 {
		t.Fatalf("runningIDs=%v, want none after portable import quarantine", runningIDs)
	}

	for _, id := range []string{queuedID, runningID} {
		job, ok, err := st.GetJob(ctx, profile.ID, id)
		if err != nil {
			t.Fatalf("get job %s: %v", id, err)
		}
		if !ok {
			t.Fatalf("job %s missing after import", id)
		}
		if job.Status != models.JobStatusFailed {
			t.Fatalf("job %s status=%s, want failed", id, job.Status)
		}
		if job.StartedAt != nil {
			t.Fatalf("job %s StartedAt=%v, want nil", id, *job.StartedAt)
		}
		if job.FinishedAt == nil || *job.FinishedAt == "" {
			t.Fatalf("job %s missing quarantine FinishedAt", id)
		}
		if job.ErrorCode == nil || *job.ErrorCode != "portable_import_quarantined" {
			t.Fatalf("job %s ErrorCode=%v, want portable_import_quarantined", id, job.ErrorCode)
		}
	}

	succeeded, ok, err := st.GetJob(ctx, profile.ID, succeededID)
	if err != nil {
		t.Fatalf("get succeeded job: %v", err)
	}
	if !ok {
		t.Fatal("succeeded job missing after import")
	}
	if succeeded.Status != models.JobStatusSucceeded {
		t.Fatalf("succeeded job status=%s, want succeeded", succeeded.Status)
	}
	if succeeded.FinishedAt == nil || *succeeded.FinishedAt != succeededAt {
		t.Fatalf("succeeded job FinishedAt=%v, want %s", succeeded.FinishedAt, succeededAt)
	}
}

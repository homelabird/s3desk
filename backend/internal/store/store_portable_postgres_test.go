package store

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"
)

// Uses the same opt-in disposable PostgreSQL database as the transaction tests.
func TestPostgresPortableMigration(t *testing.T) {
	postgres := newPostgresTestStore(t)
	source := newTestStore(t)
	profile := createTestProfile(t, source)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	uploadID := ulid.Make().String()
	empty := ""
	large := int64(1<<53 + 17)
	progress := `{"message":"한글 日本 🙂","bytes":9007199254741009}`
	fixtures := []any{
		&profileConnectionOptionsRow{ProfileID: profile.ID, SchemaVersion: 1, OptionsEnc: "opaque portable options", CreatedAt: now, UpdatedAt: now},
		&jobRow{ID: ulid.Make().String(), ProfileID: profile.ID, Type: "s3_index_objects", Status: "succeeded", PayloadJSON: `{"bucket":"portable-bucket"}`, ProgressJSON: &progress, CreatedAt: now, FinishedAt: &now},
		&uploadSessionRow{ID: uploadID, ProfileID: profile.ID, Bucket: "portable-bucket", Prefix: "incoming/", Mode: "presigned", Bytes: large, CreatedAt: now, ExpiresAt: now},
		&uploadMultipartRow{UploadID: uploadID, ProfileID: profile.ID, Path: "large.bin", Bucket: "portable-bucket", ObjectKey: "incoming/large.bin", S3UploadID: "opaque multipart id", ChunkSize: 5 << 20, FileSize: large, CreatedAt: now, UpdatedAt: now},
		&uploadObjectRow{UploadID: uploadID, ProfileID: profile.ID, Path: "large.bin", Bucket: "portable-bucket", ObjectKey: "incoming/large.bin", ExpectedSize: &large, CreatedAt: now, UpdatedAt: now},
		&uploadObjectRow{UploadID: uploadID, ProfileID: profile.ID, Path: "unknown.bin", Bucket: "portable-bucket", ObjectKey: "incoming/unknown.bin", CreatedAt: now, UpdatedAt: now},
		&objectFavoriteRow{ProfileID: profile.ID, Bucket: "portable-bucket", ObjectKey: "한글/日本 🙂 'quoted'.txt", CreatedAt: now},
	}
	for _, fixture := range fixtures {
		if err := source.db.Create(fixture).Error; err != nil {
			t.Fatal(err)
		}
	}
	replacementID := ulid.Make().String()
	for i := 0; i < 251; i++ {
		row := objectIndexRow{ProfileID: profile.ID, Bucket: "portable-bucket", ObjectKey: fmt.Sprintf("%03d/한글 🙂.txt", i), Size: large + int64(i), IndexedAt: now}
		if i%2 == 0 {
			row.ETag = &empty // Preserve the distinction between SQL NULL and empty text.
			row.LastModified = &now
		}
		if err := source.db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
		replacement := objectIndexReplacementRow{ReplacementID: replacementID, ProfileID: row.ProfileID, Bucket: row.Bucket, ObjectKey: row.ObjectKey, Size: row.Size, ETag: row.ETag, LastModified: row.LastModified, IndexedAt: row.IndexedAt}
		if err := source.db.Create(&replacement).Error; err != nil {
			t.Fatal(err)
		}
	}
	incoming, err := source.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{}
	for name, file := range incoming.EntityFiles {
		if file.Count == 0 {
			t.Fatalf("fixture did not cover %s", name)
		}
		files[name] = file.Data
	}
	createTestProfile(t, postgres)
	before, err := postgres.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	for _, failure := range []string{"recovery", "insert"} {
		t.Run(failure+" rollback", func(t *testing.T) {
			injected := errors.New("injected portable migration failure")
			if failure == "insert" {
				const callback = "test:fail_portable_job_insert"
				if err := postgres.db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
					if tx.Statement.Table == "jobs" {
						_ = tx.AddError(injected)
					}
				}); err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { _ = postgres.db.Callback().Create().Remove(callback) })
			}
			captured := false
			_, err := postgres.ImportPortableEntityFilesReplaceWithRecovery(t.Context(), files, t.TempDir(), PortableValidationOptions{}, func(preimage PortableExportBundle) error {
				captured = true
				assertPortableEntityContents(t, before, preimage)
				if failure == "recovery" {
					return injected
				}
				return nil
			})
			if !captured || !errors.Is(err, injected) {
				t.Fatalf("captured=%v error=%v", captured, err)
			}
			after, err := postgres.ExportPortableEntityFiles(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			assertPortableEntityContents(t, before, after)
		})
	}
	if _, err := postgres.ImportPortableEntityFilesReplace(t.Context(), files, t.TempDir()); err != nil {
		t.Fatal(err)
	}
	exported, err := postgres.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	assertPortableEntityContents(t, incoming, exported)
	for name, file := range exported.EntityFiles {
		files[name] = file.Data
	}
	returned := newTestStore(t)
	createTestProfile(t, returned) // Replacement must also remove pre-existing target rows.
	if _, err := returned.ImportPortableEntityFilesReplace(t.Context(), files, t.TempDir()); err != nil {
		t.Fatal(err)
	}
	final, err := returned.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	assertPortableEntityContents(t, incoming, final)
	postgres.crypto, err = newProfileCrypto(testStoreEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}
	t.Run("destination encryption", func(t *testing.T) {
		testPortableImportEncryptsPlaintextCredentials(t, postgres)
	})
	encrypted, err := postgres.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	for name, file := range encrypted.EntityFiles {
		files[name] = file.Data
	}
	encryptedSQLite := newProfileTestStore(t, Options{EncryptionKey: testStoreEncryptionKey()})
	if _, err := encryptedSQLite.ImportPortableEntityFilesReplace(t.Context(), files, t.TempDir()); err != nil {
		t.Fatal(err)
	}
	encryptedReturn, err := encryptedSQLite.ExportPortableEntityFiles(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	assertPortableEntityContents(t, encrypted, encryptedReturn)
}

func assertPortableEntityContents(t *testing.T, want, got PortableExportBundle) {
	t.Helper()
	if len(want.EntityFiles) != len(got.EntityFiles) {
		t.Fatal("portable entity set changed")
	}
	for name, expected := range want.EntityFiles {
		actual, ok := got.EntityFiles[name]
		if !ok || actual.Count != expected.Count {
			t.Fatalf("portable %s row count changed", name)
		}
		// DB collations can order rows differently; compare every complete JSON row.
		wantRows := strings.Split(strings.TrimSpace(string(expected.Data)), "\n")
		gotRows := strings.Split(strings.TrimSpace(string(actual.Data)), "\n")
		slices.Sort(wantRows)
		slices.Sort(gotRows)
		if !slices.Equal(wantRows, gotRows) {
			t.Fatalf("portable %s field values changed", name)
		}
	}
}

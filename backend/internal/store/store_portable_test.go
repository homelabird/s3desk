package store

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"

	"s3desk/internal/models"
)

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

package jobs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gorm.io/gorm"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestCleanupOrphanJobLogsBatchesDatabaseReads(t *testing.T) {
	manager, st, _, gormDB, profile, dataDir := newManagerConsistencyFixture(t)
	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"kept"}},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	logDir := filepath.Join(dataDir, "logs", "jobs")
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		t.Fatalf("create log directory: %v", err)
	}
	kept := filepath.Join(logDir, job.ID+".log")
	if err := os.WriteFile(kept, []byte("kept"), 0o600); err != nil {
		t.Fatalf("write kept log: %v", err)
	}
	for i := 0; i < 501; i++ {
		path := filepath.Join(logDir, fmt.Sprintf("orphan-%03d.log", i))
		if err := os.WriteFile(path, []byte("orphan"), 0o600); err != nil {
			t.Fatalf("write orphan log: %v", err)
		}
	}

	queries := 0
	const callback = "test_cleanup_orphan_job_logs_query_count"
	if err := gormDB.Callback().Query().Before("gorm:query").Register(callback, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "jobs" {
			queries++
		}
	}); err != nil {
		t.Fatalf("register query callback: %v", err)
	}
	t.Cleanup(func() { _ = gormDB.Callback().Query().Remove(callback) })

	manager.cleanupOrphanJobLogs(context.Background())

	if queries != 2 {
		t.Fatalf("job queries=%d, want 2 batches for 502 job IDs", queries)
	}
	if _, err := os.Stat(kept); err != nil {
		t.Fatalf("kept log removed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(logDir, "orphan-000.log")); !os.IsNotExist(err) {
		t.Fatalf("orphan log still exists or stat failed: %v", err)
	}
}

func TestCleanupExpiredJobLogs(t *testing.T) {
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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := false

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		ForcePathStyle:        &forcePathStyle,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              ws.NewHub(),
		Concurrency:      1,
		JobLogRetention:  time.Hour,
		UploadSessionTTL: time.Minute,
	})

	logDir := filepath.Join(dataDir, "logs", "jobs")
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		t.Fatalf("mkdir logs: %v", err)
	}

	ctx := context.Background()
	oldJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"a"}},
	})
	if err != nil {
		t.Fatalf("create old job: %v", err)
	}
	oldFinished := time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, oldJob.ID, models.JobStatusSucceeded, nil, &oldFinished, nil, nil, nil); err != nil {
		t.Fatalf("update old job: %v", err)
	}

	newJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"b"}},
	})
	if err != nil {
		t.Fatalf("create new job: %v", err)
	}
	newFinished := time.Now().Add(-30 * time.Minute).UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, newJob.ID, models.JobStatusSucceeded, nil, &newFinished, nil, nil, nil); err != nil {
		t.Fatalf("update new job: %v", err)
	}

	activeJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"c"}},
	})
	if err != nil {
		t.Fatalf("create active job: %v", err)
	}

	oldLog := filepath.Join(logDir, oldJob.ID+".log")
	oldCmd := filepath.Join(logDir, oldJob.ID+".cmd")
	newLog := filepath.Join(logDir, newJob.ID+".log")
	activeLog := filepath.Join(logDir, activeJob.ID+".log")

	if err := os.WriteFile(oldLog, []byte("old"), 0o600); err != nil {
		t.Fatalf("write old log: %v", err)
	}
	if err := os.WriteFile(oldCmd, []byte("cmd"), 0o600); err != nil {
		t.Fatalf("write old cmd: %v", err)
	}
	if err := os.WriteFile(newLog, []byte("new"), 0o600); err != nil {
		t.Fatalf("write new log: %v", err)
	}
	if err := os.WriteFile(activeLog, []byte("active"), 0o600); err != nil {
		t.Fatalf("write active log: %v", err)
	}

	manager.cleanupExpiredJobLogs(ctx)

	if _, err := os.Stat(oldLog); !os.IsNotExist(err) {
		t.Fatalf("expected old log removed")
	}
	if _, err := os.Stat(oldCmd); !os.IsNotExist(err) {
		t.Fatalf("expected old cmd removed")
	}
	if _, err := os.Stat(newLog); err != nil {
		t.Fatalf("expected new log kept: %v", err)
	}
	if _, err := os.Stat(activeLog); err != nil {
		t.Fatalf("expected active log kept: %v", err)
	}
}

func TestCleanupOldJobs(t *testing.T) {
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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := false

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		ForcePathStyle:        &forcePathStyle,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              ws.NewHub(),
		Concurrency:      1,
		JobRetention:     time.Hour,
		UploadSessionTTL: time.Minute,
	})

	logDir := filepath.Join(dataDir, "logs", "jobs")
	artifactDir := filepath.Join(dataDir, "artifacts", "jobs")
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		t.Fatalf("mkdir logs: %v", err)
	}
	if err := os.MkdirAll(artifactDir, 0o700); err != nil {
		t.Fatalf("mkdir artifacts: %v", err)
	}

	ctx := context.Background()
	oldJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"a"}},
	})
	if err != nil {
		t.Fatalf("create old job: %v", err)
	}
	oldFinished := time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, oldJob.ID, models.JobStatusSucceeded, nil, &oldFinished, nil, nil, nil); err != nil {
		t.Fatalf("update old job: %v", err)
	}

	newJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"b"}},
	})
	if err != nil {
		t.Fatalf("create new job: %v", err)
	}
	newFinished := time.Now().Add(-30 * time.Minute).UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, newJob.ID, models.JobStatusFailed, nil, &newFinished, nil, nil, nil); err != nil {
		t.Fatalf("update new job: %v", err)
	}

	activeJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"c"}},
	})
	if err != nil {
		t.Fatalf("create active job: %v", err)
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, activeJob.ID, models.JobStatusRunning, &startedAt, nil, nil, nil, nil); err != nil {
		t.Fatalf("update active job: %v", err)
	}

	oldLog := filepath.Join(logDir, oldJob.ID+".log")
	oldCmd := filepath.Join(logDir, oldJob.ID+".cmd")
	newLog := filepath.Join(logDir, newJob.ID+".log")
	activeLog := filepath.Join(logDir, activeJob.ID+".log")
	oldArtifact := filepath.Join(artifactDir, oldJob.ID+".zip")
	newArtifact := filepath.Join(artifactDir, newJob.ID+".zip")

	if err := os.WriteFile(oldLog, []byte("old"), 0o600); err != nil {
		t.Fatalf("write old log: %v", err)
	}
	if err := os.WriteFile(oldCmd, []byte("cmd"), 0o600); err != nil {
		t.Fatalf("write old cmd: %v", err)
	}
	if err := os.WriteFile(newLog, []byte("new"), 0o600); err != nil {
		t.Fatalf("write new log: %v", err)
	}
	if err := os.WriteFile(activeLog, []byte("active"), 0o600); err != nil {
		t.Fatalf("write active log: %v", err)
	}
	if err := os.WriteFile(oldArtifact, []byte("artifact"), 0o600); err != nil {
		t.Fatalf("write old artifact: %v", err)
	}
	if err := os.WriteFile(newArtifact, []byte("artifact"), 0o600); err != nil {
		t.Fatalf("write new artifact: %v", err)
	}

	manager.cleanupOldJobs(ctx)

	if _, ok, err := st.GetJob(ctx, profile.ID, oldJob.ID); err != nil || ok {
		t.Fatalf("expected old job removed, ok=%v err=%v", ok, err)
	}
	if _, ok, err := st.GetJob(ctx, profile.ID, newJob.ID); err != nil || !ok {
		t.Fatalf("expected new job kept, ok=%v err=%v", ok, err)
	}
	if _, ok, err := st.GetJob(ctx, profile.ID, activeJob.ID); err != nil || !ok {
		t.Fatalf("expected active job kept, ok=%v err=%v", ok, err)
	}

	if _, err := os.Stat(oldLog); !os.IsNotExist(err) {
		t.Fatalf("expected old log removed")
	}
	if _, err := os.Stat(oldCmd); !os.IsNotExist(err) {
		t.Fatalf("expected old cmd removed")
	}
	if _, err := os.Stat(oldArtifact); !os.IsNotExist(err) {
		t.Fatalf("expected old artifact removed")
	}
	if _, err := os.Stat(newLog); err != nil {
		t.Fatalf("expected new log kept: %v", err)
	}
	if _, err := os.Stat(activeLog); err != nil {
		t.Fatalf("expected active log kept: %v", err)
	}
	if _, err := os.Stat(newArtifact); err != nil {
		t.Fatalf("expected new artifact kept: %v", err)
	}
}

func TestCleanupExpiredUploadSessionsRemovesTrackedRows(t *testing.T) {
	dataDir := t.TempDir()
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(fakeS3.Close)

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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := fakeS3.URL
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := false

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		ForcePathStyle:        &forcePathStyle,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              ws.NewHub(),
		Concurrency:      1,
		UploadSessionTTL: time.Minute,
	})

	ctx := context.Background()
	expiredAt := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)
	session, err := st.CreateUploadSession(ctx, profile.ID, "bucket", "prefix/", "staging", "", expiredAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	stagingDir, err := store.ResolveUploadStagingDir(dataDir, session.ID)
	if err != nil {
		t.Fatalf("resolve staging dir: %v", err)
	}
	if err := os.MkdirAll(stagingDir, 0o700); err != nil {
		t.Fatalf("mkdir staging dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stagingDir, "chunk"), []byte("data"), 0o600); err != nil {
		t.Fatalf("write staging file: %v", err)
	}
	if err := st.SetUploadSessionStagingDir(ctx, profile.ID, session.ID, stagingDir); err != nil {
		t.Fatalf("set staging dir: %v", err)
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	expectedSize := int64(4)
	if err := st.UpsertUploadObject(ctx, store.UploadObject{
		UploadID:     session.ID,
		ProfileID:    profile.ID,
		Path:         "file.txt",
		Bucket:       "bucket",
		ObjectKey:    "prefix/file.txt",
		ExpectedSize: &expectedSize,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatalf("upsert upload object: %v", err)
	}
	if err := st.UpsertMultipartUpload(ctx, store.MultipartUpload{
		UploadID:   session.ID,
		ProfileID:  profile.ID,
		Path:       "file.txt",
		Bucket:     "bucket",
		ObjectKey:  "prefix/file.txt",
		S3UploadID: "multipart-id",
		ChunkSize:  5 * 1024 * 1024,
		FileSize:   expectedSize,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert multipart upload: %v", err)
	}

	manager.cleanupExpiredUploadSessions(ctx)

	if _, ok, err := st.GetUploadSession(ctx, profile.ID, session.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if ok {
		t.Fatalf("expected upload session to be deleted")
	}
	objects, err := st.ListUploadObjects(ctx, profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(objects) != 0 {
		t.Fatalf("expected upload objects to be deleted, got %d", len(objects))
	}
	uploads, err := st.ListMultipartUploads(ctx, profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list multipart uploads: %v", err)
	}
	if len(uploads) != 0 {
		t.Fatalf("expected multipart uploads to be deleted, got %d", len(uploads))
	}
	if _, err := os.Stat(stagingDir); !os.IsNotExist(err) {
		t.Fatalf("expected staging dir to be removed, err=%v", err)
	}
}

func TestCleanupExpiredUploadSessionsDeletesDirectTempPrefixBeforeRows(t *testing.T) {
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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := false

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		ForcePathStyle:        &forcePathStyle,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              ws.NewHub(),
		Concurrency:      1,
		UploadSessionTTL: time.Minute,
	})

	ctx := context.Background()
	expiredAt := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)
	session, err := st.CreateUploadSession(ctx, profile.ID, "bucket", "incoming", "direct", "", expiredAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	var rcloneCalls [][]string
	installJobsStartRcloneHook(t, func(_ context.Context, _ models.ProfileSecrets, jobID string, args []string) (*rcloneProcess, error) {
		if jobID != "upload-session-cleanup-"+session.ID {
			t.Fatalf("jobID=%q, want upload-session-cleanup-%s", jobID, session.ID)
		}
		rcloneCalls = append(rcloneCalls, append([]string(nil), args...))
		return newTestRcloneProcess("", "", nil), nil
	})

	manager.cleanupExpiredUploadSessions(ctx)

	if len(rcloneCalls) != 1 {
		t.Fatalf("rcloneCalls=%v, want one temp cleanup call", rcloneCalls)
	}
	wantTarget := "remote:bucket/incoming/.s3desk-upload-temp/" + session.ID + "/"
	if args := rcloneCalls[0]; len(args) != 2 || args[0] != "delete" || args[1] != wantTarget {
		t.Fatalf("rclone args=%v, want [delete %s]", args, wantTarget)
	}
	if _, ok, err := st.GetUploadSession(ctx, profile.ID, session.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if ok {
		t.Fatalf("expected upload session to be deleted")
	}
}

func TestCleanupExpiredUploadSessionsKeepsDirectSessionWhenTempCleanupFails(t *testing.T) {
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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := false

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		ForcePathStyle:        &forcePathStyle,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              ws.NewHub(),
		Concurrency:      1,
		UploadSessionTTL: time.Minute,
	})

	ctx := context.Background()
	expiredAt := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)
	session, err := st.CreateUploadSession(ctx, profile.ID, "bucket", "incoming", "direct", "", expiredAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	installJobsStartRcloneHook(t, func(_ context.Context, _ models.ProfileSecrets, _ string, _ []string) (*rcloneProcess, error) {
		return newTestRcloneProcess("", "delete failed", errors.New("exit status 1")), nil
	})

	manager.cleanupExpiredUploadSessions(ctx)

	if _, ok, err := st.GetUploadSession(ctx, profile.ID, session.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if !ok {
		t.Fatalf("expected upload session to remain for retry")
	}
}

func TestCleanupExpiredUploadSessionsAbortsProviderMultipartBeforeDeletingRows(t *testing.T) {
	var aborted = make(chan string, 2)
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		aborted <- r.URL.Query().Get("uploadId")
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(fakeS3.Close)

	manager, st, _, _, profile, _ := newManagerConsistencyFixture(t)
	endpoint := fakeS3.URL
	if _, ok, err := st.UpdateProfile(context.Background(), profile.ID, models.ProfileUpdateRequest{Endpoint: &endpoint}); err != nil || !ok {
		t.Fatalf("update profile endpoint: ok=%v err=%v", ok, err)
	}

	ctx := context.Background()
	expiredAt := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	sessions := make([]store.UploadSession, 0, 2)
	for _, mode := range []string{"presigned", "staging"} {
		session, err := st.CreateUploadSession(ctx, profile.ID, "bucket", "incoming", mode, "", expiredAt)
		if err != nil {
			t.Fatalf("create %s upload session: %v", mode, err)
		}
		sessions = append(sessions, session)
		if err := st.UpsertMultipartUpload(ctx, store.MultipartUpload{
			UploadID:   session.ID,
			ProfileID:  profile.ID,
			Path:       "file.bin",
			Bucket:     "bucket",
			ObjectKey:  "incoming/file.bin",
			S3UploadID: "multipart-" + mode,
			ChunkSize:  5,
			FileSize:   10,
			CreatedAt:  now,
			UpdatedAt:  now,
		}); err != nil {
			t.Fatalf("upsert %s multipart upload: %v", mode, err)
		}
	}

	manager.cleanupExpiredUploadSessions(ctx)

	wantAborts := map[string]bool{"multipart-presigned": false, "multipart-staging": false}
	for range sessions {
		select {
		case got := <-aborted:
			if _, ok := wantAborts[got]; !ok {
				t.Fatalf("abort uploadId=%q, want one of %v", got, wantAborts)
			}
			wantAborts[got] = true
		case <-time.After(2 * time.Second):
			t.Fatal("expected provider multipart abort request")
		}
	}
	for uploadID, aborted := range wantAborts {
		if !aborted {
			t.Fatalf("uploadId=%q was not aborted", uploadID)
		}
	}
	for _, session := range sessions {
		if _, ok, err := st.GetUploadSession(ctx, profile.ID, session.ID); err != nil || ok {
			t.Fatalf("upload session %s deleted=%v err=%v, want deleted", session.ID, ok, err)
		}
		uploads, err := st.ListMultipartUploads(ctx, profile.ID, session.ID)
		if err != nil {
			t.Fatalf("list multipart uploads for %s: %v", session.ID, err)
		}
		if len(uploads) != 0 {
			t.Fatalf("multipart uploads for %s=%d, want 0", session.ID, len(uploads))
		}
	}
}

func TestCleanupOrphanAPIRcloneConfigsRemovesOnlyExpiredFiles(t *testing.T) {
	dataDir := t.TempDir()
	dir := filepath.Join(dataDir, "tmp", "rclone")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir rclone temp dir: %v", err)
	}
	oldPath := filepath.Join(dir, "api-old.rclone.conf")
	newPath := filepath.Join(dir, "api-new.rclone.conf")
	for _, file := range []string{oldPath, newPath} {
		if err := os.WriteFile(file, []byte("secret_access_key=secret"), 0o600); err != nil {
			t.Fatalf("write %s: %v", file, err)
		}
	}
	oldAt := time.Now().Add(-orphanAPIRcloneConfigRetention - time.Hour)
	if err := os.Chtimes(oldPath, oldAt, oldAt); err != nil {
		t.Fatalf("age old config: %v", err)
	}

	manager := NewManager(Config{DataDir: dataDir})
	manager.cleanupOrphanAPIRcloneConfigs(context.Background())

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatalf("old config still exists or unexpected stat error: %v", err)
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("new config removed or unexpected stat error: %v", err)
	}
}

package jobs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestRecoverAndRequeue(t *testing.T) {
	t.Setenv("JOB_QUEUE_CAPACITY", "10")

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
	rcloneDir := filepath.Join(dataDir, "tmp", "rclone")
	if err := os.MkdirAll(rcloneDir, 0o700); err != nil {
		t.Fatalf("mkdir rclone temp dir: %v", err)
	}
	for _, name := range []string{"api-old.rclone.conf", "api-new.rclone.conf"} {
		if err := os.WriteFile(filepath.Join(rcloneDir, name), []byte("secret_access_key=secret"), 0o600); err != nil {
			t.Fatalf("write rclone config %s: %v", name, err)
		}
	}

	ctx := context.Background()
	runningJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeTransferSyncLocalToS3,
		Payload: map[string]any{"bucket": "test", "prefix": "p/", "localPath": dataDir},
	})
	if err != nil {
		t.Fatalf("create running job: %v", err)
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, runningJob.ID, models.JobStatusRunning, &startedAt, nil, nil, nil, nil); err != nil {
		t.Fatalf("update running job: %v", err)
	}

	queuedJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"a"}},
	})
	if err != nil {
		t.Fatalf("create queued job: %v", err)
	}
	orphanJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeTransferDirectUpload,
		Payload: map[string]any{"uploadId": "legacy-upload"},
	})
	if err != nil {
		t.Fatalf("create legacy queued job: %v", err)
	}

	if err := manager.RecoverAndRequeue(ctx); err != nil {
		t.Fatalf("recover: %v", err)
	}

	updated, ok, err := st.GetJob(ctx, profile.ID, runningJob.ID)
	if err != nil || !ok {
		t.Fatalf("expected running job, ok=%v err=%v", ok, err)
	}
	if updated.Status != models.JobStatusFailed {
		t.Fatalf("expected failed status, got %s", updated.Status)
	}
	if updated.ErrorCode == nil || *updated.ErrorCode != ErrorCodeServerRestarted {
		t.Fatalf("expected error code %q, got %v", ErrorCodeServerRestarted, updated.ErrorCode)
	}
	if updated.Error == nil || *updated.Error == "" {
		t.Fatalf("expected error message")
	}

	stats := manager.QueueStats()
	if stats.Depth != 1 {
		t.Fatalf("expected only supported queued job to be enqueued, got depth %d", stats.Depth)
	}

	queued, ok, err := st.GetJob(ctx, profile.ID, queuedJob.ID)
	if err != nil || !ok {
		t.Fatalf("expected queued job to remain, ok=%v err=%v", ok, err)
	}
	if queued.Status != models.JobStatusQueued {
		t.Fatalf("expected queued status, got %s", queued.Status)
	}
	rejected, ok, err := st.GetJob(ctx, profile.ID, orphanJob.ID)
	if err != nil || !ok {
		t.Fatalf("expected legacy queued job, ok=%v err=%v", ok, err)
	}
	if rejected.Status != models.JobStatusFailed {
		t.Fatalf("expected unsupported queued job to fail during recovery, got %s", rejected.Status)
	}
	if rejected.ErrorCode == nil || *rejected.ErrorCode != ErrorCodeUnknown {
		t.Fatalf("expected error code %q, got %v", ErrorCodeUnknown, rejected.ErrorCode)
	}
	if rejected.Error == nil || *rejected.Error == "" {
		t.Fatal("expected unsupported job error")
	}
	for _, name := range []string{"api-old.rclone.conf", "api-new.rclone.conf"} {
		if _, err := os.Stat(filepath.Join(rcloneDir, name)); !os.IsNotExist(err) {
			t.Fatalf("startup rclone config %s still exists or stat failed: %v", name, err)
		}
	}
}

func TestRecoverAndRequeueTracksOverflowWaiter(t *testing.T) {
	t.Setenv("JOB_QUEUE_CAPACITY", "1")

	manager, st, _, _, profile, _ := newManagerConsistencyFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	for i := 0; i < 2; i++ {
		if _, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
			Type:    JobTypeS3DeleteObjects,
			Payload: map[string]any{"bucket": "test-bucket", "keys": []string{"a.txt"}},
		}); err != nil {
			t.Fatalf("create queued job %d: %v", i, err)
		}
	}

	if err := manager.RecoverAndRequeue(ctx); err != nil {
		t.Fatalf("recover: %v", err)
	}
	if stats := manager.QueueStats(); stats.Depth != 1 || stats.Capacity != 1 {
		t.Fatalf("queue stats=%+v, want depth/capacity 1/1", stats)
	}

	waitCtx, waitCancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer waitCancel()
	if err := manager.Wait(waitCtx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Wait() error=%v, want blocked recovery waiter", err)
	}

	cancel()
	if err := manager.Wait(context.Background()); err != nil {
		t.Fatalf("Wait() after recovery cancellation: %v", err)
	}
}

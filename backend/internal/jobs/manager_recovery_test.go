package jobs

import (
	"context"
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

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Name:            "test",
		Endpoint:        "http://localhost:9000",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
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
	if stats.Depth == 0 {
		t.Fatalf("expected queued job to be enqueued")
	}

	queued, ok, err := st.GetJob(ctx, profile.ID, queuedJob.ID)
	if err != nil || !ok {
		t.Fatalf("expected queued job to remain, ok=%v err=%v", ok, err)
	}
	if queued.Status != models.JobStatusQueued {
		t.Fatalf("expected queued status, got %s", queued.Status)
	}
}

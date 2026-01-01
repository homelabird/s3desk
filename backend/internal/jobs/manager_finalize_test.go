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

func TestFinalizeJobStripsTransientProgressFields(t *testing.T) {
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
	job, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"a"}},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	objectsDone := int64(3)
	objectsTotal := int64(5)
	bytesDone := int64(120)
	bytesTotal := int64(512)
	speedBps := int64(42)
	objectsPerSecond := int64(2)
	etaSeconds := 12
	progress := &models.JobProgress{
		ObjectsDone:      &objectsDone,
		ObjectsTotal:     &objectsTotal,
		ObjectsPerSecond: &objectsPerSecond,
		BytesDone:        &bytesDone,
		BytesTotal:       &bytesTotal,
		SpeedBps:         &speedBps,
		EtaSeconds:       &etaSeconds,
	}

	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, job.ID, models.JobStatusRunning, &startedAt, nil, progress, nil, nil); err != nil {
		t.Fatalf("update job: %v", err)
	}

	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := manager.finalizeJob(job.ID, models.JobStatusSucceeded, &finishedAt, nil, nil); err != nil {
		t.Fatalf("finalize job: %v", err)
	}

	updated, ok, err := st.GetJob(ctx, profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok {
		t.Fatalf("expected job")
	}
	if updated.Status != models.JobStatusSucceeded {
		t.Fatalf("expected status %s, got %s", models.JobStatusSucceeded, updated.Status)
	}
	if updated.Progress == nil {
		t.Fatalf("expected progress")
	}
	if updated.Progress.SpeedBps != nil {
		t.Fatalf("expected SpeedBps cleared, got %v", *updated.Progress.SpeedBps)
	}
	if updated.Progress.ObjectsPerSecond != nil {
		t.Fatalf("expected ObjectsPerSecond cleared, got %v", *updated.Progress.ObjectsPerSecond)
	}
	if updated.Progress.EtaSeconds != nil {
		t.Fatalf("expected EtaSeconds cleared, got %v", *updated.Progress.EtaSeconds)
	}
	if updated.Progress.ObjectsDone == nil || *updated.Progress.ObjectsDone != objectsDone {
		t.Fatalf("expected ObjectsDone %d, got %v", objectsDone, updated.Progress.ObjectsDone)
	}
	if updated.Progress.ObjectsTotal == nil || *updated.Progress.ObjectsTotal != objectsTotal {
		t.Fatalf("expected ObjectsTotal %d, got %v", objectsTotal, updated.Progress.ObjectsTotal)
	}
	if updated.Progress.BytesDone == nil || *updated.Progress.BytesDone != bytesDone {
		t.Fatalf("expected BytesDone %d, got %v", bytesDone, updated.Progress.BytesDone)
	}
	if updated.Progress.BytesTotal == nil || *updated.Progress.BytesTotal != bytesTotal {
		t.Fatalf("expected BytesTotal %d, got %v", bytesTotal, updated.Progress.BytesTotal)
	}
}

package jobs

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"gorm.io/gorm"

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

	jobQueries := 0
	const queryCallback = "test_finalize_job_query_count"
	if err := gormDB.Callback().Query().Before("gorm:query").Register(queryCallback, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "jobs" {
			jobQueries++
		}
	}); err != nil {
		t.Fatalf("register job query callback: %v", err)
	}
	t.Cleanup(func() { _ = gormDB.Callback().Query().Remove(queryCallback) })

	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	finalProgress, err := manager.finalizeJob(job.ID, models.JobStatusSucceeded, &finishedAt, nil, nil)
	if err != nil {
		t.Fatalf("finalize job: %v", err)
	}
	if jobQueries != 1 {
		t.Fatalf("job queries=%d, want 1 per finalization", jobQueries)
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
	if !reflect.DeepEqual(finalProgress, updated.Progress) {
		t.Fatalf("returned progress=%+v, stored progress=%+v", finalProgress, updated.Progress)
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

	readFailureJob, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test", "keys": []string{"b"}},
	})
	if err != nil {
		t.Fatalf("create read-failure job: %v", err)
	}
	if err := st.UpdateJobStatus(ctx, readFailureJob.ID, models.JobStatusRunning, &startedAt, nil, progress, nil, nil); err != nil {
		t.Fatalf("update read-failure job: %v", err)
	}

	injectedErr := errors.New("injected final progress read failure")
	const readFailureCallback = "test_finalize_job_read_failure"
	if err := gormDB.Callback().Query().Before("gorm:query").Register(readFailureCallback, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "jobs" {
			_ = tx.AddError(injectedErr)
		}
	}); err != nil {
		t.Fatalf("register read failure callback: %v", err)
	}
	_, err = manager.finalizeJob(readFailureJob.ID, models.JobStatusSucceeded, &finishedAt, nil, nil)
	if removeErr := gormDB.Callback().Query().Remove(readFailureCallback); removeErr != nil {
		t.Fatalf("remove read failure callback: %v", removeErr)
	}
	if !errors.Is(err, injectedErr) {
		t.Fatalf("finalize read error=%v, want %v", err, injectedErr)
	}

	unchanged, ok, err := st.GetJob(ctx, profile.ID, readFailureJob.ID)
	if err != nil {
		t.Fatalf("get read-failure job: %v", err)
	}
	if !ok || unchanged.Status != models.JobStatusRunning {
		t.Fatalf("read-failure job status=%s, want %s", unchanged.Status, models.JobStatusRunning)
	}
}

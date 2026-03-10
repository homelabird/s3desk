package jobs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestPersistAndPublishRunningProgressSkipsEventOnStoreError(t *testing.T) {
	manager, st, hub, gormDB, profile, _ := newManagerConsistencyFixture(t)

	injectedErr := errors.New("injected running progress update failure")
	registerJobStatusUpdateFailure(t, gormDB, "test_progress_update_failure", models.JobStatusRunning, true, injectedErr)

	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type:    JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test-bucket", "keys": []string{"a.txt"}},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	client := hub.Subscribe()
	t.Cleanup(func() { hub.Unsubscribe(client) })

	done := int64(1)
	total := int64(2)
	err = manager.persistAndPublishRunningProgress(job.ID, &models.JobProgress{
		ObjectsDone:  &done,
		ObjectsTotal: &total,
	})
	if err == nil {
		t.Fatalf("expected progress persistence error")
	}
	if !strings.Contains(err.Error(), injectedErr.Error()) {
		t.Fatalf("expected injected error %q, got %v", injectedErr.Error(), err)
	}

	updated, ok, err := st.GetJob(context.Background(), profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok {
		t.Fatalf("expected job")
	}
	if updated.Progress != nil {
		t.Fatalf("expected progress to remain nil when persistence fails, got %+v", updated.Progress)
	}

	assertNoHubEventType(t, client, "job.progress")
}

func TestRunJobReturnsJoinedErrorWhenFinalizeFailedAfterRunFailure(t *testing.T) {
	manager, st, hub, gormDB, profile, _ := newManagerConsistencyFixture(t)

	injectedErr := errors.New("injected finalize failed-status persistence failure")
	registerJobStatusUpdateFailure(t, gormDB, "test_finalize_failed_update_failure", models.JobStatusFailed, false, injectedErr)

	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type:    "unsupported_job_type",
		Payload: map[string]any{},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	client := hub.Subscribe()
	t.Cleanup(func() { hub.Unsubscribe(client) })

	err = manager.runJob(context.Background(), job.ID)
	if err == nil {
		t.Fatalf("expected runJob error")
	}
	if !strings.Contains(err.Error(), "unsupported job type") {
		t.Fatalf("expected unsupported job type error, got %v", err)
	}
	if !strings.Contains(err.Error(), injectedErr.Error()) {
		t.Fatalf("expected injected finalize error %q, got %v", injectedErr.Error(), err)
	}

	updated, ok, err := st.GetJob(context.Background(), profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok {
		t.Fatalf("expected job")
	}
	if updated.Status != models.JobStatusRunning {
		t.Fatalf("expected status to remain running after finalize failure, got %s", updated.Status)
	}
	if updated.FinishedAt != nil {
		t.Fatalf("expected finishedAt to remain nil after finalize failure")
	}

	assertNoHubEventType(t, client, "job.completed")
}

func TestRunJobReturnsErrorWhenFinalizeFailedAfterSuccess(t *testing.T) {
	manager, st, hub, gormDB, profile, dataDir := newManagerConsistencyFixture(t)

	injectedErr := errors.New("injected finalize succeeded-status persistence failure")
	registerJobStatusUpdateFailure(t, gormDB, "test_finalize_succeeded_update_failure", models.JobStatusSucceeded, false, injectedErr)

	localDir := filepath.Join(dataDir, "local")
	if err := os.MkdirAll(localDir, 0o700); err != nil {
		t.Fatalf("mkdir local dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(localDir, "sample.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatalf("write local file: %v", err)
	}

	t.Setenv("RCLONE_TUNE", "true")
	installJobsProcessHooks(t, func(_ context.Context, _ string, args []string, _ string, _ TestRunRcloneAttemptOptions, writeLog func(level string, message string)) (string, error) {
		writeLog("info", "consistency flow")
		if len(args) == 0 {
			return "", unexpectedJobsProcessArgs(args)
		}
		return "", nil
	})

	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type: JobTypeTransferSyncLocalToS3,
		Payload: map[string]any{
			"bucket":    "test-bucket",
			"prefix":    "path/",
			"localPath": localDir,
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	client := hub.Subscribe()
	t.Cleanup(func() { hub.Unsubscribe(client) })

	err = manager.runJob(context.Background(), job.ID)
	if err == nil {
		t.Fatalf("expected runJob error")
	}
	if !strings.Contains(err.Error(), injectedErr.Error()) {
		t.Fatalf("expected injected finalize error %q, got %v", injectedErr.Error(), err)
	}

	updated, ok, err := st.GetJob(context.Background(), profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok {
		t.Fatalf("expected job")
	}
	if updated.Status != models.JobStatusRunning {
		t.Fatalf("expected status to remain running after finalize failure, got %s", updated.Status)
	}
	if updated.FinishedAt != nil {
		t.Fatalf("expected finishedAt to remain nil after finalize failure")
	}

	assertNoHubEventType(t, client, "job.completed")
}

func newManagerConsistencyFixture(t *testing.T) (*Manager, *store.Store, *ws.Hub, *gorm.DB, models.Profile, string) {
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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://127.0.0.1:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := true

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test-profile",
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

	hub := ws.NewHub()
	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              hub,
		Concurrency:      1,
		JobLogMaxBytes:   0,
		JobRetention:     0,
		UploadSessionTTL: time.Minute,
	})

	return manager, st, hub, gormDB, profile, dataDir
}

func registerJobStatusUpdateFailure(
	t *testing.T,
	gormDB *gorm.DB,
	callbackName string,
	targetStatus models.JobStatus,
	requireProgressJSON bool,
	injectedErr error,
) {
	t.Helper()

	if err := gormDB.Callback().Update().Before("gorm:update").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement == nil || tx.Statement.Table != "jobs" {
			return
		}
		updates, ok := tx.Statement.Dest.(map[string]any)
		if !ok {
			return
		}

		rawStatus, ok := updates["status"]
		if !ok {
			return
		}
		status, ok := rawStatus.(string)
		if !ok || status != string(targetStatus) {
			return
		}
		if requireProgressJSON {
			if _, ok := updates["progress_json"]; !ok {
				return
			}
		}
		_ = tx.AddError(injectedErr)
	}); err != nil {
		t.Fatalf("register callback: %v", err)
	}

	t.Cleanup(func() {
		if err := gormDB.Callback().Update().Remove(callbackName); err != nil {
			t.Fatalf("remove callback: %v", err)
		}
	})
}

func assertNoHubEventType(t *testing.T, client *ws.Client, eventType string) {
	t.Helper()

	deadline := time.After(150 * time.Millisecond)
	for {
		select {
		case msg := <-client.Messages():
			if msg.Type == eventType {
				t.Fatalf("unexpected hub event %q", eventType)
			}
		case <-deadline:
			return
		}
	}
}

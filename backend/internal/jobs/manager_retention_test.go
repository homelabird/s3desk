package jobs

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

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

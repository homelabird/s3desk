package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

func TestListJobsFiltersAndCursor(t *testing.T) {
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

	st, err := New(gormDB, Options{})
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

	ctx := context.Background()
	job1, err := st.CreateJob(ctx, profile.ID, CreateJobInput{
		Type:    "test",
		Payload: map[string]any{"key": "a"},
	})
	if err != nil {
		t.Fatalf("create job1: %v", err)
	}
	job2, err := st.CreateJob(ctx, profile.ID, CreateJobInput{
		Type:    "test",
		Payload: map[string]any{"key": "b"},
	})
	if err != nil {
		t.Fatalf("create job2: %v", err)
	}
	job3, err := st.CreateJob(ctx, profile.ID, CreateJobInput{
		Type:    "test",
		Payload: map[string]any{"key": "c"},
	})
	if err != nil {
		t.Fatalf("create job3: %v", err)
	}

	failedMsg := "failed"
	codeRateLimited := "rate_limited"
	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, job1.ID, models.JobStatusFailed, nil, &finishedAt, nil, &failedMsg, &codeRateLimited); err != nil {
		t.Fatalf("update job1: %v", err)
	}
	finishedAt2 := time.Now().Add(1 * time.Second).UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, job2.ID, models.JobStatusSucceeded, nil, &finishedAt2, nil, nil, nil); err != nil {
		t.Fatalf("update job2: %v", err)
	}
	codeAccessDenied := "access_denied"
	finishedAt3 := time.Now().Add(2 * time.Second).UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(ctx, job3.ID, models.JobStatusFailed, nil, &finishedAt3, nil, &failedMsg, &codeAccessDenied); err != nil {
		t.Fatalf("update job3: %v", err)
	}

	statusFailed := models.JobStatusFailed
	failedResp, err := st.ListJobs(ctx, profile.ID, JobFilter{Status: &statusFailed, Limit: 10})
	if err != nil {
		t.Fatalf("list failed jobs: %v", err)
	}
	if len(failedResp.Items) != 2 {
		t.Fatalf("expected 2 failed jobs, got %d", len(failedResp.Items))
	}

	codeFilter := codeRateLimited
	rateResp, err := st.ListJobs(ctx, profile.ID, JobFilter{ErrorCode: &codeFilter, Limit: 10})
	if err != nil {
		t.Fatalf("list error code jobs: %v", err)
	}
	if len(rateResp.Items) != 1 {
		t.Fatalf("expected 1 rate limited job, got %d", len(rateResp.Items))
	}
	if rateResp.Items[0].ErrorCode == nil || *rateResp.Items[0].ErrorCode != codeRateLimited {
		t.Fatalf("expected error code %q, got %v", codeRateLimited, rateResp.Items[0].ErrorCode)
	}

	firstPage, err := st.ListJobs(ctx, profile.ID, JobFilter{Limit: 2})
	if err != nil {
		t.Fatalf("list jobs first page: %v", err)
	}
	if len(firstPage.Items) != 2 {
		t.Fatalf("expected 2 jobs on first page, got %d", len(firstPage.Items))
	}
	if firstPage.NextCursor == nil {
		t.Fatalf("expected next cursor")
	}

	secondPage, err := st.ListJobs(ctx, profile.ID, JobFilter{Limit: 2, Cursor: firstPage.NextCursor})
	if err != nil {
		t.Fatalf("list jobs second page: %v", err)
	}
	if len(secondPage.Items) != 1 {
		t.Fatalf("expected 1 job on second page, got %d", len(secondPage.Items))
	}

	ids := map[string]struct{}{}
	for _, job := range append(firstPage.Items, secondPage.Items...) {
		ids[job.ID] = struct{}{}
	}
	if len(ids) != 3 {
		t.Fatalf("expected 3 unique jobs, got %d", len(ids))
	}
}

func TestListJobsSkipsCorruptedPayload(t *testing.T) {
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

	st, err := New(gormDB, Options{})
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

	ctx := context.Background()
	goodJob, err := st.CreateJob(ctx, profile.ID, CreateJobInput{
		Type:    "test",
		Payload: map[string]any{"key": "good"},
	})
	if err != nil {
		t.Fatalf("create good job: %v", err)
	}

	// Insert a row with corrupted payload JSON directly via GORM.
	if err := gormDB.Exec(
		"INSERT INTO jobs (id, profile_id, type, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		"CORRUPT01", profile.ID, "test", "queued", "not-valid-json", time.Now().UTC().Format(time.RFC3339Nano),
	).Error; err != nil {
		t.Fatalf("insert corrupted row: %v", err)
	}

	resp, err := st.ListJobs(ctx, profile.ID, JobFilter{Limit: 10})
	if err != nil {
		t.Fatalf("list jobs should not fail: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 valid job, got %d", len(resp.Items))
	}
	if resp.Items[0].ID != goodJob.ID {
		t.Fatalf("expected job ID %q, got %q", goodJob.ID, resp.Items[0].ID)
	}
}

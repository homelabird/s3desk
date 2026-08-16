package store

import (
	"context"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"s3desk/internal/models"
)

func TestListJobsFiltersAndCursor(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)

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

func TestCreateJobPersistsInitialCompletionState(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()
	startedAt := "2026-08-12T00:00:00Z"
	finishedAt := "2026-08-12T00:00:01Z"
	bytesDone := int64(7)
	progress := &models.JobProgress{BytesDone: &bytesDone, BytesTotal: &bytesDone}

	created, err := st.CreateJob(ctx, profile.ID, CreateJobInput{
		Type:       "transfer_direct_upload",
		Payload:    map[string]any{"uploadId": "upload-1"},
		Status:     models.JobStatusSucceeded,
		StartedAt:  &startedAt,
		FinishedAt: &finishedAt,
		Progress:   progress,
	})
	if err != nil {
		t.Fatalf("create completed job: %v", err)
	}

	got, ok, err := st.GetJob(ctx, profile.ID, created.ID)
	if err != nil {
		t.Fatalf("get completed job: %v", err)
	}
	if !ok {
		t.Fatal("expected completed job")
	}
	if got.Status != models.JobStatusSucceeded {
		t.Fatalf("status=%s, want %s", got.Status, models.JobStatusSucceeded)
	}
	if got.StartedAt == nil || *got.StartedAt != startedAt {
		t.Fatalf("startedAt=%v, want %q", got.StartedAt, startedAt)
	}
	if got.FinishedAt == nil || *got.FinishedAt != finishedAt {
		t.Fatalf("finishedAt=%v, want %q", got.FinishedAt, finishedAt)
	}
	if got.Progress == nil || got.Progress.BytesDone == nil || *got.Progress.BytesDone != bytesDone {
		t.Fatalf("progress=%+v, want bytesDone %d", got.Progress, bytesDone)
	}
}

func TestListJobsFailsOnCorruptedPayload(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)

	ctx := context.Background()
	if err := st.db.Exec(
		"INSERT INTO jobs (id, profile_id, type, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		"CORRUPT01", profile.ID, "test", "queued", "not-valid-json", time.Now().UTC().Format(time.RFC3339Nano),
	).Error; err != nil {
		t.Fatalf("insert corrupted row: %v", err)
	}

	_, err := st.ListJobs(ctx, profile.ID, JobFilter{Limit: 10})
	if err == nil || !strings.Contains(err.Error(), `decode job "CORRUPT01"`) {
		t.Fatalf("expected contextual decode error, got %v", err)
	}
}

func TestUpdateJobStatusIfCurrentGuardsExpectedStatus(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	job, err := st.CreateJob(ctx, profile.ID, CreateJobInput{
		Type:    "test",
		Payload: map[string]any{"key": "value"},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	updated, err := st.UpdateJobStatusIfCurrent(ctx, job.ID, []models.JobStatus{models.JobStatusQueued}, models.JobStatusRunning, &startedAt, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("guarded update to running: %v", err)
	}
	if !updated {
		t.Fatalf("expected queued job to transition to running")
	}

	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	updated, err = st.UpdateJobStatusIfCurrent(ctx, job.ID, []models.JobStatus{models.JobStatusQueued}, models.JobStatusSucceeded, nil, &finishedAt, nil, nil, nil)
	if err != nil {
		t.Fatalf("guarded update from stale status: %v", err)
	}
	if updated {
		t.Fatalf("expected stale status guard to skip update")
	}

	got, ok, err := st.GetJob(ctx, profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok {
		t.Fatalf("expected job")
	}
	if got.Status != models.JobStatusRunning {
		t.Fatalf("expected status to remain running, got %s", got.Status)
	}
	if got.FinishedAt != nil {
		t.Fatalf("expected finishedAt to remain nil, got %q", *got.FinishedAt)
	}
}

func TestListAndCancelActiveProfileJobsInTwoStatements(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	otherProfile := createTestProfile(t, st)
	ctx := context.Background()

	queued, err := st.CreateJob(ctx, profile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("create queued job: %v", err)
	}
	queued2, err := st.CreateJob(ctx, profile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("create second queued job: %v", err)
	}
	running, err := st.CreateJob(ctx, profile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("create running job: %v", err)
	}
	if err := st.UpdateJobStatus(ctx, running.ID, models.JobStatusRunning, nil, nil, nil, nil, nil); err != nil {
		t.Fatalf("mark job running: %v", err)
	}
	other, err := st.CreateJob(ctx, otherProfile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("create other profile job: %v", err)
	}

	queries, updates := 0, 0
	const (
		queryCallback  = "test_list_active_jobs_query_count"
		updateCallback = "test_cancel_queued_jobs_update_count"
	)
	if err := st.db.Callback().Query().Before("gorm:query").Register(queryCallback, func(*gorm.DB) { queries++ }); err != nil {
		t.Fatalf("register query callback: %v", err)
	}
	if err := st.db.Callback().Update().Before("gorm:update").Register(updateCallback, func(*gorm.DB) { updates++ }); err != nil {
		t.Fatalf("register update callback: %v", err)
	}
	t.Cleanup(func() {
		_ = st.db.Callback().Query().Remove(queryCallback)
		_ = st.db.Callback().Update().Remove(updateCallback)
	})

	queuedIDs, runningIDs, err := st.ListActiveJobIDsByProfile(ctx, profile.ID)
	if err != nil {
		t.Fatalf("list active jobs: %v", err)
	}
	if queries != 1 {
		t.Fatalf("query statements=%d, want 1", queries)
	}
	canceled := make(map[string]struct{}, len(queuedIDs))
	for _, id := range queuedIDs {
		canceled[id] = struct{}{}
	}
	if len(canceled) != 2 {
		t.Fatalf("queued IDs=%v, want %s and %s", queuedIDs, queued.ID, queued2.ID)
	}
	if _, ok := canceled[queued.ID]; !ok {
		t.Fatalf("queued IDs=%v, missing %s", queuedIDs, queued.ID)
	}
	if _, ok := canceled[queued2.ID]; !ok {
		t.Fatalf("queued IDs=%v, missing %s", queuedIDs, queued2.ID)
	}
	if len(runningIDs) != 1 || runningIDs[0] != running.ID {
		t.Fatalf("running IDs=%v, want [%s]", runningIDs, running.ID)
	}

	finishedAt := "2026-08-16T00:00:00Z"
	if err := st.CancelQueuedJobsByIDs(ctx, profile.ID, queuedIDs, finishedAt, "canceled"); err != nil {
		t.Fatalf("cancel queued jobs: %v", err)
	}
	if updates != 1 {
		t.Fatalf("update statements=%d, want 1", updates)
	}

	for _, tc := range []struct {
		profileID string
		jobID     string
		status    models.JobStatus
	}{
		{profile.ID, queued.ID, models.JobStatusCanceled},
		{profile.ID, queued2.ID, models.JobStatusCanceled},
		{profile.ID, running.ID, models.JobStatusRunning},
		{otherProfile.ID, other.ID, models.JobStatusQueued},
	} {
		job, ok, err := st.GetJob(ctx, tc.profileID, tc.jobID)
		if err != nil || !ok || job.Status != tc.status {
			t.Fatalf("job %s = (%s, %v, %v), want %s", tc.jobID, job.Status, ok, err, tc.status)
		}
	}
}

func TestDeleteFinishedJobsBeforeDeletesOldestBatchInOneStatement(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	oldest, err := st.CreateJob(ctx, profile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("create oldest job: %v", err)
	}
	newer, err := st.CreateJob(ctx, profile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("create newer job: %v", err)
	}
	active, err := st.CreateJob(ctx, profile.ID, CreateJobInput{Type: "test", Payload: map[string]any{}})
	if err != nil {
		t.Fatalf("create active job: %v", err)
	}
	oldestFinished := "2026-08-14T00:00:00Z"
	newerFinished := "2026-08-15T00:00:00Z"
	if err := st.UpdateJobStatus(ctx, oldest.ID, models.JobStatusSucceeded, nil, &oldestFinished, nil, nil, nil); err != nil {
		t.Fatalf("finish oldest job: %v", err)
	}
	if err := st.UpdateJobStatus(ctx, newer.ID, models.JobStatusFailed, nil, &newerFinished, nil, nil, nil); err != nil {
		t.Fatalf("finish newer job: %v", err)
	}

	counter := &sqlStatementCounter{Interface: logger.Discard}
	st.db = st.db.Session(&gorm.Session{Logger: counter})

	ids, err := st.DeleteFinishedJobsBefore(ctx, "2026-08-16T00:00:00Z", 1)
	if err != nil {
		t.Fatalf("delete finished jobs: %v", err)
	}
	if len(ids) != 1 || ids[0] != oldest.ID {
		t.Fatalf("deleted IDs=%v, want [%s]", ids, oldest.ID)
	}
	if counter.statements != 1 {
		t.Fatalf("SQL statements=%d, want 1", counter.statements)
	}

	for _, tc := range []struct {
		jobID string
		want  bool
	}{
		{oldest.ID, false},
		{newer.ID, true},
		{active.ID, true},
	} {
		_, ok, err := st.GetJob(ctx, profile.ID, tc.jobID)
		if err != nil || ok != tc.want {
			t.Fatalf("job %s exists=%v err=%v, want exists=%v", tc.jobID, ok, err, tc.want)
		}
	}
}

type sqlStatementCounter struct {
	logger.Interface
	statements int
}

func (c *sqlStatementCounter) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	c.statements++
	c.Interface.Trace(ctx, begin, fc, err)
}

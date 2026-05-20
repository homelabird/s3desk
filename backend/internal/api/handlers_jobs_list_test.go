package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestBuildJobListFilter_UsesQueryValues(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/jobs?status=failed&type=s3_delete_objects&errorCode=rate_limited&limit=25&cursor=job-3",
		nil,
	)

	filter, err := buildJobListFilter(req)
	if err != nil {
		t.Fatalf("buildJobListFilter error = %v", err)
	}
	if filter.Status == nil || *filter.Status != models.JobStatusFailed {
		t.Fatalf("filter.Status=%v, want failed", filter.Status)
	}
	if filter.Type == nil || *filter.Type != jobs.JobTypeS3DeleteObjects {
		t.Fatalf("filter.Type=%v, want %q", filter.Type, jobs.JobTypeS3DeleteObjects)
	}
	if filter.ErrorCode == nil || *filter.ErrorCode != jobs.ErrorCodeRateLimited {
		t.Fatalf("filter.ErrorCode=%v, want %q", filter.ErrorCode, jobs.ErrorCodeRateLimited)
	}
	if filter.Limit != 25 {
		t.Fatalf("filter.Limit=%d, want 25", filter.Limit)
	}
	if filter.Cursor == nil || *filter.Cursor != "job-3" {
		t.Fatalf("filter.Cursor=%v, want job-3", filter.Cursor)
	}
}

func TestBuildJobListFilter_InvalidLimitReturnsError(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs?limit=oops", nil)
	_, err := buildJobListFilter(req)
	if err == nil {
		t.Fatal("expected error")
	}
	var prepErr *jobListPreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%v, want jobListPreparationError", err)
	}
	if prepErr.status != http.StatusBadRequest {
		t.Fatalf("prepErr.status=%d, want %d", prepErr.status, http.StatusBadRequest)
	}
	if got := prepErr.details["limit"]; got != "oops" {
		t.Fatalf("details.limit=%v, want oops", got)
	}
}

func TestJobListHTTPService_PrepareListJobs_RequiresProfile(t *testing.T) {
	t.Parallel()

	svc := newJobListHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)

	prepared := svc.prepareListJobs(req)
	if prepared.err == nil {
		t.Fatal("expected error")
	}
	if _, ok := prepared.err.(*jobListPreparationError); !ok {
		t.Fatalf("prepared.err=%v, want jobListPreparationError", prepared.err)
	}
}

func TestJobListHTTPService_HandleListJobs_ReturnsFilteredResponse(t *testing.T) {
	t.Parallel()

	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	ctx := context.Background()
	rateLimited, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type: jobs.JobTypeS3DeleteObjects,
		Payload: map[string]any{
			"bucket": "test-bucket",
			"keys":   []any{"a.txt"},
		},
	})
	if err != nil {
		t.Fatalf("create rate-limited job: %v", err)
	}
	other, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type: jobs.JobTypeS3DeleteObjects,
		Payload: map[string]any{
			"bucket": "test-bucket",
			"keys":   []any{"b.txt"},
		},
	})
	if err != nil {
		t.Fatalf("create other job: %v", err)
	}

	finishedAt := testNowRFC3339Nano()
	rateMsg := "rate limited"
	rateCode := jobs.ErrorCodeRateLimited
	if err := st.UpdateJobStatus(ctx, rateLimited.ID, models.JobStatusFailed, nil, &finishedAt, nil, &rateMsg, &rateCode); err != nil {
		t.Fatalf("update rate-limited job: %v", err)
	}
	accessMsg := "access denied"
	accessCode := jobs.ErrorCodeAccessDenied
	if err := st.UpdateJobStatus(ctx, other.ID, models.JobStatusFailed, nil, &finishedAt, nil, &accessMsg, &accessCode); err != nil {
		t.Fatalf("update access-denied job: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs?errorCode="+jobs.ErrorCodeRateLimited, nil)
	req.Header.Set("X-Profile-Id", profile.ID)
	rec := httptest.NewRecorder()

	newJobListHTTPService(&server{store: st}).handleListJobs(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}
	var listed models.JobsListResponse
	if err := json.NewDecoder(rec.Body).Decode(&listed); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(listed.Items) != 1 {
		t.Fatalf("len(listed.Items)=%d, want 1", len(listed.Items))
	}
	if listed.Items[0].ID != rateLimited.ID {
		t.Fatalf("listed.Items[0].ID=%q, want %q", listed.Items[0].ID, rateLimited.ID)
	}
}

func testNowRFC3339Nano() string {
	return "2026-04-11T00:00:00Z"
}

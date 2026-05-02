package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/jobs"
	"s3desk/internal/metrics"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestBuildCreateJobSubmission_NormalizesNilPayload(t *testing.T) {
	t.Parallel()

	got := buildCreateJobSubmission(models.JobCreateRequest{
		Type: jobs.JobTypeS3DeleteObjects,
	})

	if got.Type != jobs.JobTypeS3DeleteObjects {
		t.Fatalf("got.Type=%q, want %q", got.Type, jobs.JobTypeS3DeleteObjects)
	}
	if !reflect.DeepEqual(got.Payload, map[string]any{}) {
		t.Fatalf("got.Payload=%#v, want empty map", got.Payload)
	}
}

func TestBuildRetryJobSubmission_NormalizesNilPayloadForRetryableStatus(t *testing.T) {
	t.Parallel()

	for _, status := range []models.JobStatus{models.JobStatusFailed, models.JobStatusCanceled} {
		t.Run(string(status), func(t *testing.T) {
			t.Parallel()

			got, err := buildRetryJobSubmission(models.Job{
				Type:   jobs.JobTypeS3DeleteObjects,
				Status: status,
			})
			if err != nil {
				t.Fatalf("buildRetryJobSubmission error = %v", err)
			}
			if got.Type != jobs.JobTypeS3DeleteObjects {
				t.Fatalf("got.Type=%q, want %q", got.Type, jobs.JobTypeS3DeleteObjects)
			}
			if !reflect.DeepEqual(got.Payload, map[string]any{}) {
				t.Fatalf("got.Payload=%#v, want empty map", got.Payload)
			}
		})
	}
}

func TestBuildRetryJobSubmission_RejectsNonRetryableStatus(t *testing.T) {
	t.Parallel()

	_, err := buildRetryJobSubmission(models.Job{
		Type:   jobs.JobTypeS3DeleteObjects,
		Status: models.JobStatusSucceeded,
	})
	if err == nil {
		t.Fatal("expected error")
	}

	var validationErr *jobSubmissionValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("err=%v, want jobSubmissionValidationError", err)
	}
	if validationErr.status != http.StatusBadRequest {
		t.Fatalf("validationErr.status=%d, want %d", validationErr.status, http.StatusBadRequest)
	}
	if validationErr.code != "invalid_request" {
		t.Fatalf("validationErr.code=%q, want invalid_request", validationErr.code)
	}
	if validationErr.details["status"] != models.JobStatusSucceeded {
		t.Fatalf("validationErr.details=%#v, want status=%q", validationErr.details, models.JobStatusSucceeded)
	}
}

func TestDecodeCreateJobSubmissionRequest_InvalidJSON(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader("{"))
	_, err := decodeCreateJobSubmissionRequest(req)
	if err == nil {
		t.Fatal("expected error")
	}

	var prepErr *jobSubmissionPreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%v, want jobSubmissionPreparationError", err)
	}
	if prepErr.status != http.StatusBadRequest {
		t.Fatalf("prepErr.status=%d, want %d", prepErr.status, http.StatusBadRequest)
	}
	if prepErr.code != "invalid_json" {
		t.Fatalf("prepErr.code=%q, want invalid_json", prepErr.code)
	}
}

func TestDecodeCreateJobSubmissionRequest_NormalizesNilPayload(t *testing.T) {
	t.Parallel()

	body := strings.NewReader(`{"type":"s3_delete_objects"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", body)
	got, err := decodeCreateJobSubmissionRequest(req)
	if err != nil {
		t.Fatalf("decodeCreateJobSubmissionRequest error = %v", err)
	}
	if got.Type != jobs.JobTypeS3DeleteObjects {
		t.Fatalf("got.Type=%q, want %q", got.Type, jobs.JobTypeS3DeleteObjects)
	}
	if !reflect.DeepEqual(got.Payload, map[string]any{}) {
		t.Fatalf("got.Payload=%#v, want empty map", got.Payload)
	}
}

func TestWriteJobSubmissionFailure_WritesValidationError(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	wrote := writeJobSubmissionFailure(rec, newJobSubmissionValidationError(
		http.StatusBadRequest,
		"invalid_request",
		"type is required",
		map[string]any{"type": ""},
	), nil, jobSubmissionFailureOptions{})
	if !wrote {
		t.Fatal("expected wrote=true")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
}

func TestWriteJobSubmissionFailure_WritesQueueFullResponse(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	wrote := writeJobSubmissionFailure(rec, jobs.ErrJobQueueFull, &jobs.QueueStats{
		Depth:    2,
		Capacity: 8,
	}, jobSubmissionFailureOptions{
		ProfileID: "profile-1",
		JobType:   jobs.JobTypeS3DeleteObjects,
		JobID:     "job-1",
	})
	if !wrote {
		t.Fatal("expected wrote=true")
	}
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusTooManyRequests)
	}
	if rec.Header().Get("Retry-After") != "2" {
		t.Fatalf("Retry-After=%q, want 2", rec.Header().Get("Retry-After"))
	}

	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "job_queue_full" {
		t.Fatalf("resp.Error.Code=%q, want job_queue_full", resp.Error.Code)
	}
}

func TestWriteJobSubmissionFailure_WritesInternalErrorFallback(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	wrote := writeJobSubmissionFailure(rec, errors.New("boom"), nil, jobSubmissionFailureOptions{
		InternalMessage: "failed to enqueue job",
	})
	if !wrote {
		t.Fatal("expected wrote=true")
	}
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusInternalServerError)
	}

	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "internal_error" {
		t.Fatalf("resp.Error.Code=%q, want internal_error", resp.Error.Code)
	}
	if resp.Error.Message != "failed to enqueue job" {
		t.Fatalf("resp.Error.Message=%q, want failed to enqueue job", resp.Error.Message)
	}
}

func TestWriteJobSubmissionPreparationFailure_WritesPreparationError(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	wrote := writeJobSubmissionPreparationFailure(rec, newJobSubmissionPreparationError(
		http.StatusNotFound,
		"not_found",
		"job not found",
		map[string]any{"jobId": "job-1"},
	))
	if !wrote {
		t.Fatal("expected wrote=true")
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestServerFinalizeSubmittedJob_PublishesCreatedEvent(t *testing.T) {
	t.Parallel()

	srv := &server{hub: ws.NewHub()}
	client := srv.hub.Subscribe()
	defer srv.hub.Unsubscribe(client)

	job := models.Job{
		ID:     "job-1",
		Type:   jobs.JobTypeS3DeleteObjects,
		Status: models.JobStatusQueued,
	}
	srv.finalizeSubmittedJob(job, jobSubmissionSuccessOptions{JobType: job.Type})

	select {
	case msg, ok := <-client.Messages():
		if !ok {
			t.Fatal("messages channel closed before event")
		}
		var evt ws.Event
		if err := json.Unmarshal(msg.Data, &evt); err != nil {
			t.Fatalf("unmarshal event: %v", err)
		}
		if evt.Type != "job.created" {
			t.Fatalf("evt.Type=%q, want job.created", evt.Type)
		}
		if evt.JobID != job.ID {
			t.Fatalf("evt.JobID=%q, want %q", evt.JobID, job.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for created event")
	}
}

func TestServerFinalizeSubmittedJob_IncrementsRetryMetric(t *testing.T) {
	t.Parallel()

	srv := &server{metrics: metrics.New()}
	job := models.Job{
		ID:     "job-1",
		Type:   jobs.JobTypeS3DeleteObjects,
		Status: models.JobStatusQueued,
	}
	srv.finalizeSubmittedJob(job, jobSubmissionSuccessOptions{
		JobType:          job.Type,
		IncrementRetried: true,
	})

	rec := httptest.NewRecorder()
	srv.metrics.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), `jobs_retried_total{type="s3_delete_objects"} 1`) {
		t.Fatalf("metrics output missing retried counter:\n%s", rec.Body.String())
	}
}

func TestServerPrepareRetryJobSubmission_ReturnsRetryableSubmission(t *testing.T) {
	t.Parallel()

	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type: jobs.JobTypeS3DeleteObjects,
		Payload: map[string]any{
			"bucket": "test-bucket",
			"keys":   []any{"a.txt"},
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	errorCode := jobs.ErrorCodeUnknown
	if err := st.UpdateJobStatus(context.Background(), job.ID, models.JobStatusFailed, nil, &finishedAt, nil, nil, &errorCode); err != nil {
		t.Fatalf("mark failed: %v", err)
	}

	srv := &server{store: st}
	got, err := srv.prepareRetryJobSubmission(context.Background(), profile.ID, job.ID)
	if err != nil {
		t.Fatalf("prepareRetryJobSubmission error = %v", err)
	}
	if got.Type != jobs.JobTypeS3DeleteObjects {
		t.Fatalf("got.Type=%q, want %q", got.Type, jobs.JobTypeS3DeleteObjects)
	}
	if got.Payload["bucket"] != "test-bucket" {
		t.Fatalf("got.Payload=%#v, want bucket=test-bucket", got.Payload)
	}
}

func TestServerPrepareRetryJobSubmission_ReturnsNotFoundError(t *testing.T) {
	t.Parallel()

	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	srv := &server{store: st}

	_, err := srv.prepareRetryJobSubmission(context.Background(), profile.ID, "missing-job")
	if err == nil {
		t.Fatal("expected error")
	}
	var prepErr *jobSubmissionPreparationError
	if !errors.As(err, &prepErr) {
		t.Fatalf("err=%v, want jobSubmissionPreparationError", err)
	}
	if prepErr.status != http.StatusNotFound {
		t.Fatalf("prepErr.status=%d, want %d", prepErr.status, http.StatusNotFound)
	}
	if prepErr.code != "not_found" {
		t.Fatalf("prepErr.code=%q, want not_found", prepErr.code)
	}
}

func TestJobSubmissionHTTPService_ExecuteCreate_ReturnsPreparationErrorForMissingProfile(t *testing.T) {
	t.Parallel()

	svc := newJobSubmissionHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(`{"type":"s3_delete_objects"}`))

	prepared := svc.prepareCreateSubmissionRequest(req)
	if prepared.err == nil {
		t.Fatal("expected error")
	}
	var prepErr *jobSubmissionPreparationError
	if !errors.As(prepared.err, &prepErr) {
		t.Fatalf("prepared.err=%v, want jobSubmissionPreparationError", prepared.err)
	}
	if prepErr.code != "missing_profile" {
		t.Fatalf("prepErr.code=%q, want missing_profile", prepErr.code)
	}
}

func TestJobSubmissionHTTPService_ExecuteRetry_ReturnsPreparationErrorForMissingJobID(t *testing.T) {
	t.Parallel()

	svc := newJobSubmissionHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs/retry", nil)
	req.Header.Set("X-Profile-Id", "profile-1")

	prepared := svc.prepareRetrySubmissionRequest(req)
	if prepared.err == nil {
		t.Fatal("expected error")
	}
	var prepErr *jobSubmissionPreparationError
	if !errors.As(prepared.err, &prepErr) {
		t.Fatalf("prepared.err=%v, want jobSubmissionPreparationError", prepared.err)
	}
	if prepErr.code != "invalid_request" {
		t.Fatalf("prepErr.code=%q, want invalid_request", prepErr.code)
	}
}

func TestJobSubmissionHTTPService_PrepareCreateSubmissionRequest_ReturnsPreparedSubmission(t *testing.T) {
	t.Parallel()

	svc := newJobSubmissionHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(`{"type":"s3_delete_objects"}`))
	req.Header.Set("X-Profile-Id", "profile-1")

	prepared := svc.prepareCreateSubmissionRequest(req)
	if prepared.err != nil {
		t.Fatalf("prepareCreateSubmissionRequest error = %v", prepared.err)
	}
	if prepared.profileID != "profile-1" {
		t.Fatalf("prepared.profileID=%q, want profile-1", prepared.profileID)
	}
	if prepared.submission.Type != jobs.JobTypeS3DeleteObjects {
		t.Fatalf("prepared.submission.Type=%q, want %q", prepared.submission.Type, jobs.JobTypeS3DeleteObjects)
	}
	if !prepared.successOptions.LogQueued {
		t.Fatal("expected LogQueued=true")
	}
}

func TestJobSubmissionHTTPService_PrepareRetrySubmissionRequest_ReturnsPreparedSubmission(t *testing.T) {
	t.Parallel()

	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type: jobs.JobTypeS3DeleteObjects,
		Payload: map[string]any{
			"bucket": "test-bucket",
			"keys":   []any{"a.txt"},
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
	errorCode := jobs.ErrorCodeUnknown
	if err := st.UpdateJobStatus(context.Background(), job.ID, models.JobStatusFailed, nil, &finishedAt, nil, nil, &errorCode); err != nil {
		t.Fatalf("mark failed: %v", err)
	}

	svc := newJobSubmissionHTTPService(&server{store: st})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs/"+job.ID+"/retry", nil)
	req.Header.Set("X-Profile-Id", profile.ID)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("jobId", job.ID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	prepared := svc.prepareRetrySubmissionRequest(req)
	if prepared.err != nil {
		t.Fatalf("prepareRetrySubmissionRequest error = %v", prepared.err)
	}
	if prepared.profileID != profile.ID {
		t.Fatalf("prepared.profileID=%q, want %q", prepared.profileID, profile.ID)
	}
	if prepared.submission.Type != jobs.JobTypeS3DeleteObjects {
		t.Fatalf("prepared.submission.Type=%q, want %q", prepared.submission.Type, jobs.JobTypeS3DeleteObjects)
	}
	if !prepared.successOptions.IncrementRetried {
		t.Fatal("expected IncrementRetried=true")
	}
}

func TestApplyJobSubmissionHandleResultSideEffects_FinalizesSuccess(t *testing.T) {
	t.Parallel()

	srv := &server{hub: ws.NewHub()}
	client := srv.hub.Subscribe()
	defer srv.hub.Unsubscribe(client)

	job := models.Job{ID: "job-1", Type: jobs.JobTypeS3DeleteObjects, Status: models.JobStatusQueued}

	applyJobSubmissionHandleResultSideEffects(srv, job, jobSubmissionSuccessOptions{
		JobType: jobs.JobTypeS3DeleteObjects,
	}, nil, nil, jobSubmissionFailureOptions{})

	select {
	case msg, ok := <-client.Messages():
		if !ok {
			t.Fatal("messages channel closed before event")
		}
		var evt ws.Event
		if err := json.Unmarshal(msg.Data, &evt); err != nil {
			t.Fatalf("unmarshal event: %v", err)
		}
		if evt.Type != "job.created" {
			t.Fatalf("evt.Type=%q, want job.created", evt.Type)
		}
		if evt.JobID != job.ID {
			t.Fatalf("evt.JobID=%q, want %q", evt.JobID, job.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for created event")
	}
}

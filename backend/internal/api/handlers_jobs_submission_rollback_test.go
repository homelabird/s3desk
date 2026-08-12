package api

import (
	"context"
	"testing"

	"s3desk/internal/jobs"
	"s3desk/internal/store"
)

func TestRollbackCreatedJobAfterEnqueueFailureIgnoresRequestCancellation(t *testing.T) {
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type:    jobs.JobTypeS3DeleteObjects,
		Payload: map[string]any{"bucket": "test-bucket", "keys": []any{"object.txt"}},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := (&server{store: st}).rollbackCreatedJobAfterEnqueueFailure(ctx, profile.ID, job, jobs.ErrJobQueueFull); err != nil {
		t.Fatalf("rollbackCreatedJobAfterEnqueueFailure: %v", err)
	}

	if _, ok, err := st.GetJob(context.Background(), profile.ID, job.ID); err != nil {
		t.Fatalf("get job: %v", err)
	} else if ok {
		t.Fatal("expected created job to be removed")
	}
}

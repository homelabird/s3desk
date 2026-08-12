package api

import (
	"context"
	"testing"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestDeleteMultipartUploadMetadataAfterRemoteIgnoresRequestCancellation(t *testing.T) {
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "bucket-a", "incoming", uploadModePresigned, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	if err := st.UpsertMultipartUpload(context.Background(), store.MultipartUpload{
		UploadID:   session.ID,
		ProfileID:  profile.ID,
		Path:       "file.bin",
		Bucket:     "bucket-a",
		ObjectKey:  "incoming/file.bin",
		S3UploadID: "provider-upload-1",
		ChunkSize:  5,
		FileSize:   5,
	}); err != nil {
		t.Fatalf("upsert multipart metadata: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := (&server{store: st}).deleteMultipartUploadMetadataAfterRemote(ctx, profile.ID, session.ID, "file.bin"); err != nil {
		t.Fatalf("delete multipart metadata: %v", err)
	}
	if _, ok, err := st.GetMultipartUpload(context.Background(), profile.ID, session.ID, "file.bin"); err != nil || ok {
		t.Fatalf("multipart metadata found=%v err=%v, want deleted", ok, err)
	}
}

func TestAbortStoredMultipartUploadsIgnoresRequestCancellation(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{})
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "bucket-a", "incoming", uploadModePresigned, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	seedMultipartUploadMetadata(t, st, profile.ID, session.ID, "bucket-a", "incoming", "file.bin", "provider-upload-1", 5, 5)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := (&server{store: st}).abortStoredMultipartUploads(ctx, profile.ID, session.ID); err != nil {
		t.Fatalf("abort stored multipart uploads: %v", err)
	}
	if uploads, err := st.ListMultipartUploads(context.Background(), profile.ID, session.ID); err != nil {
		t.Fatalf("list multipart uploads: %v", err)
	} else if len(uploads) != 0 {
		t.Fatalf("multipart uploads=%d, want 0", len(uploads))
	}
}

func TestCleanupImmediateUploadCommitStateIgnoresRequestCancellation(t *testing.T) {
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "bucket-a", "incoming", uploadModeDirect, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	expectedSize := int64(5)
	if err := st.UpsertUploadObject(context.Background(), store.UploadObject{
		UploadID:     session.ID,
		ProfileID:    profile.ID,
		Path:         "file.bin",
		Bucket:       "bucket-a",
		ObjectKey:    "incoming/file.bin",
		ExpectedSize: &expectedSize,
	}); err != nil {
		t.Fatalf("upsert upload object: %v", err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpsertMultipartUpload(context.Background(), store.MultipartUpload{
		UploadID:   session.ID,
		ProfileID:  profile.ID,
		Path:       "file.bin",
		Bucket:     "bucket-a",
		ObjectKey:  "incoming/file.bin",
		S3UploadID: "provider-upload-1",
		ChunkSize:  5,
		FileSize:   5,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert multipart metadata: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	(&server{store: st}).cleanupImmediateUploadCommitState(ctx, profile.ID, session.ID)

	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if ok {
		t.Fatal("expected upload session to be deleted")
	}
	objects, err := st.ListUploadObjects(context.Background(), profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(objects) != 0 {
		t.Fatalf("upload objects=%d, want 0", len(objects))
	}
	multipartUploads, err := st.ListMultipartUploads(context.Background(), profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list multipart uploads: %v", err)
	}
	if len(multipartUploads) != 0 {
		t.Fatalf("multipart uploads=%d, want 0", len(multipartUploads))
	}
}

func TestUploadCommitFinalizeService_EnqueueObjectIndexRepair(t *testing.T) {
	st, manager, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	newUploadCommitFinalizeService(&server{store: st, jobs: manager}).enqueueObjectIndexRepair(
		context.Background(), profile.ID, "bucket-a", "incoming",
	)

	jobType := jobs.JobTypeS3IndexObjects
	status := models.JobStatusQueued
	resp, err := st.ListJobs(context.Background(), profile.ID, store.JobFilter{
		Type:   &jobType,
		Status: &status,
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("list repair jobs: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("repair jobs=%d, want 1", len(resp.Items))
	}
	job := resp.Items[0]
	if job.Payload["bucket"] != "bucket-a" || job.Payload["prefix"] != "incoming" {
		t.Fatalf("repair payload=%v, want bucket and prefix", job.Payload)
	}
	if fullReindex, ok := job.Payload["fullReindex"].(bool); !ok || !fullReindex {
		t.Fatalf("repair payload.fullReindex=%v, want true", job.Payload["fullReindex"])
	}
	if manager.QueueStats().Depth != 1 {
		t.Fatalf("queue depth=%d, want 1", manager.QueueStats().Depth)
	}
}

func TestUploadCommitFinalizeService_RollsBackObjectIndexRepairOnQueueFull(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("JOB_QUEUE_CAPACITY", "1")

	st, manager, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	if err := manager.Enqueue("queue-filler"); err != nil {
		t.Fatalf("enqueue queue filler: %v", err)
	}

	newUploadCommitFinalizeService(&server{store: st, jobs: manager}).enqueueObjectIndexRepair(
		context.Background(), profile.ID, "bucket-a", "incoming",
	)

	jobType := jobs.JobTypeS3IndexObjects
	status := models.JobStatusQueued
	resp, err := st.ListJobs(context.Background(), profile.ID, store.JobFilter{
		Type:   &jobType,
		Status: &status,
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("list repair jobs: %v", err)
	}
	if len(resp.Items) != 0 {
		t.Fatalf("repair jobs=%d, want 0 after queue rollback", len(resp.Items))
	}
	if manager.QueueStats().Depth != 1 {
		t.Fatalf("queue depth=%d, want filler only", manager.QueueStats().Depth)
	}
}

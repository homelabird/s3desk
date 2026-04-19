package api

import (
	"context"
	"reflect"
	"testing"
	"time"

	"s3desk/internal/store"
)

func TestBuildUploadVerificationTargetsFromTracked(t *testing.T) {
	sizeA := int64(11)
	sizeB := int64(22)
	targets := buildUploadVerificationTargetsFromTracked([]store.UploadObject{
		{Path: "a.txt", Bucket: "demo", ObjectKey: "prefix/a.txt", ExpectedSize: &sizeA},
		{Path: "", Bucket: "demo", ObjectKey: "prefix/skip.txt", ExpectedSize: &sizeB},
		{Path: "b.txt", Bucket: "demo", ObjectKey: "prefix/b.txt", ExpectedSize: &sizeB},
	})

	want := []uploadVerificationTarget{
		{Path: "a.txt", Bucket: "demo", Key: "prefix/a.txt", ExpectedSize: &sizeA},
		{Path: "b.txt", Bucket: "demo", Key: "prefix/b.txt", ExpectedSize: &sizeB},
	}
	if !reflect.DeepEqual(targets, want) {
		t.Fatalf("targets=%#v, want %#v", targets, want)
	}
}

func TestBuildUploadVerificationTargetsFromMultipart(t *testing.T) {
	targets := buildUploadVerificationTargetsFromMultipart([]store.MultipartUpload{
		{Path: "a.txt", Bucket: "demo", ObjectKey: "prefix/a.txt", FileSize: 11},
		{Path: "", Bucket: "demo", ObjectKey: "prefix/skip.txt", FileSize: 22},
		{Path: "b.txt", Bucket: "demo", ObjectKey: "prefix/b.txt", FileSize: 33},
	})

	if len(targets) != 2 {
		t.Fatalf("len(targets)=%d, want 2", len(targets))
	}
	if got := *targets[0].ExpectedSize; got != 11 {
		t.Fatalf("targets[0].ExpectedSize=%d, want 11", got)
	}
	if got := *targets[1].ExpectedSize; got != 33 {
		t.Fatalf("targets[1].ExpectedSize=%d, want 33", got)
	}
}

func TestBuildUploadVerificationTargetsFromRequest(t *testing.T) {
	size := int64(7)
	targets := buildUploadVerificationTargetsFromRequest(store.UploadSession{
		Bucket: "demo",
		Prefix: "nested",
	}, uploadCommitRequest{
		Items: []uploadCommitItem{
			{Path: "folder/file.txt", Size: &size},
			{Path: "../skip.txt"},
			{Path: "plain.txt"},
		},
	})

	want := []uploadVerificationTarget{
		{Path: "folder/file.txt", Bucket: "demo", Key: "nested/folder/file.txt", ExpectedSize: &size},
		{Path: "plain.txt", Bucket: "demo", Key: "nested/plain.txt", ExpectedSize: nil},
	}
	if !reflect.DeepEqual(targets, want) {
		t.Fatalf("targets=%#v, want %#v", targets, want)
	}
}

func TestMergeUploadVerificationTargets(t *testing.T) {
	size := int64(11)
	merged := mergeUploadVerificationTargets(
		[]uploadVerificationTarget{
			{Path: "a.txt", Key: "prefix/a.txt", ExpectedSize: &size},
			{Path: "", Key: "prefix/fallback.txt"},
		},
		[]uploadVerificationTarget{
			{Path: "a.txt", Key: "prefix/a-duplicate.txt"},
			{Path: "", Key: "prefix/fallback.txt"},
			{Path: "b.txt", Key: "prefix/b.txt"},
		},
	)

	want := []uploadVerificationTarget{
		{Path: "a.txt", Key: "prefix/a.txt", ExpectedSize: &size},
		{Path: "", Key: "prefix/fallback.txt"},
		{Path: "b.txt", Key: "prefix/b.txt"},
	}
	if !reflect.DeepEqual(merged, want) {
		t.Fatalf("merged=%#v, want %#v", merged, want)
	}
}

func TestUploadCommitVerificationServiceBuildPlanFallsBackToRequestTargets(t *testing.T) {
	ctx := context.Background()
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	us, err := st.CreateUploadSession(ctx, profile.ID, "demo", "nested", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	size := int64(7)
	plan, uploadErr := newUploadCommitVerificationService(&server{store: st}).buildPlan(
		ctx,
		profile.ID,
		us.ID,
		us,
		uploadCommitRequest{
			Items: []uploadCommitItem{
				{Path: "folder/file.txt", Size: &size},
				{Path: "plain.txt"},
			},
			ItemsTruncated: true,
		},
		nil,
	)
	if uploadErr != nil {
		t.Fatalf("buildPlan: %v", uploadErr)
	}

	want := []uploadVerificationTarget{
		{Path: "folder/file.txt", Bucket: "demo", Key: "nested/folder/file.txt", ExpectedSize: &size},
		{Path: "plain.txt", Bucket: "demo", Key: "nested/plain.txt", ExpectedSize: nil},
	}
	if !reflect.DeepEqual(plan.targets, want) {
		t.Fatalf("plan.targets=%#v, want %#v", plan.targets, want)
	}
	if plan.includeTotals {
		t.Fatal("expected includeTotals to be false when falling back to truncated request items")
	}
	if !plan.itemsTruncated {
		t.Fatal("expected itemsTruncated to be true")
	}
}

func TestUploadCommitVerificationServiceBuildPlanMergesTrackedAndMultipartTargets(t *testing.T) {
	ctx := context.Background()
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	us, err := st.CreateUploadSession(ctx, profile.ID, "demo", "nested", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	sizeA := int64(11)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpsertUploadObject(ctx, store.UploadObject{
		UploadID:     us.ID,
		ProfileID:    profile.ID,
		Path:         "a.txt",
		Bucket:       us.Bucket,
		ObjectKey:    "nested/a.txt",
		ExpectedSize: &sizeA,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatalf("upsert upload object: %v", err)
	}
	if err := st.UpsertMultipartUpload(ctx, store.MultipartUpload{
		UploadID:   us.ID,
		ProfileID:  profile.ID,
		Path:       "a.txt",
		Bucket:     us.Bucket,
		ObjectKey:  "nested/a-duplicate.txt",
		S3UploadID: "multipart-a",
		ChunkSize:  5,
		FileSize:   sizeA,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert duplicate multipart upload: %v", err)
	}
	if err := st.UpsertMultipartUpload(ctx, store.MultipartUpload{
		UploadID:   us.ID,
		ProfileID:  profile.ID,
		Path:       "b.txt",
		Bucket:     us.Bucket,
		ObjectKey:  "nested/b.txt",
		S3UploadID: "multipart-b",
		ChunkSize:  5,
		FileSize:   22,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert multipart upload: %v", err)
	}

	plan, uploadErr := newUploadCommitVerificationService(&server{store: st}).buildPlan(
		ctx,
		profile.ID,
		us.ID,
		us,
		uploadCommitRequest{
			Items:          []uploadCommitItem{{Path: "ignored.txt"}},
			ItemsTruncated: true,
		},
		mustListMultipartUploads(t, st, profile.ID, us.ID),
	)
	if uploadErr != nil {
		t.Fatalf("buildPlan: %v", uploadErr)
	}

	if len(plan.targets) != 2 {
		t.Fatalf("len(plan.targets)=%d, want 2", len(plan.targets))
	}
	if plan.targets[0].Path != "a.txt" || plan.targets[0].Key != "nested/a.txt" {
		t.Fatalf("first target=%#v, want tracked a.txt", plan.targets[0])
	}
	if plan.targets[1].Path != "b.txt" || plan.targets[1].Key != "nested/b.txt" {
		t.Fatalf("second target=%#v, want multipart b.txt", plan.targets[1])
	}
	if !plan.includeTotals {
		t.Fatal("expected includeTotals to stay true when tracked or multipart state exists")
	}
	if plan.itemsTruncated {
		t.Fatal("expected itemsTruncated to stay false when tracked or multipart state exists")
	}
}

func mustListMultipartUploads(t *testing.T, st *store.Store, profileID, uploadID string) []store.MultipartUpload {
	t.Helper()
	uploads, err := st.ListMultipartUploads(context.Background(), profileID, uploadID)
	if err != nil {
		t.Fatalf("list multipart uploads: %v", err)
	}
	return uploads
}

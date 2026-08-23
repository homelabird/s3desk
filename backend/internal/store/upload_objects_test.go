package store

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"

	"s3desk/internal/models"
)

func createUploadObjectTestSession(t *testing.T, st *Store) (models.Profile, UploadSession) {
	t.Helper()
	endpoint := "http://127.0.0.1:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "upload-object-test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	session, err := st.CreateUploadSession(
		context.Background(),
		profile.ID,
		"test-bucket",
		"incoming",
		"presigned",
		"",
		time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
	)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	return profile, session
}

func TestUpsertUploadObjectWithByteLimitTracksReplacementDelta(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	profile, session := createUploadObjectTestSession(t, st)
	ctx := context.Background()

	size := int64(6)
	if err := st.UpsertUploadObjectWithByteLimit(ctx, UploadObject{
		UploadID:     session.ID,
		ProfileID:    profile.ID,
		Path:         "file.bin",
		Bucket:       session.Bucket,
		ObjectKey:    "incoming/file.bin",
		ExpectedSize: &size,
	}, 10); err != nil {
		t.Fatalf("reserve initial object: %v", err)
	}
	assertUploadSessionBytes(t, st, profile.ID, session.ID, 6)

	size = 4
	if err := st.UpsertUploadObjectWithByteLimit(ctx, UploadObject{
		UploadID:     session.ID,
		ProfileID:    profile.ID,
		Path:         "file.bin",
		Bucket:       session.Bucket,
		ObjectKey:    "incoming/file.bin",
		ExpectedSize: &size,
	}, 10); err != nil {
		t.Fatalf("reserve replacement object: %v", err)
	}
	assertUploadSessionBytes(t, st, profile.ID, session.ID, 4)

	size = 7
	err := st.UpsertUploadObjectWithByteLimit(ctx, UploadObject{
		UploadID:     session.ID,
		ProfileID:    profile.ID,
		Path:         "other.bin",
		Bucket:       session.Bucket,
		ObjectKey:    "incoming/other.bin",
		ExpectedSize: &size,
	}, 10)
	if !errors.Is(err, ErrUploadSessionBytesExceeded) {
		t.Fatalf("reserve over limit error=%v, want ErrUploadSessionBytesExceeded", err)
	}
	assertUploadSessionBytes(t, st, profile.ID, session.ID, 4)

	objects, err := st.ListUploadObjects(ctx, profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(objects) != 1 || objects[0].Path != "file.bin" {
		t.Fatalf("objects=%#v, want only file.bin", objects)
	}
}

func TestUpsertUploadObjectWithByteLimitConcurrentSessionLimit(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	testUpsertUploadObjectWithByteLimitConcurrentSessionLimit(t, st)
}

func testUpsertUploadObjectWithByteLimitConcurrentSessionLimit(t *testing.T, st *Store) {
	t.Helper()
	profile, session := createUploadObjectTestSession(t, st)
	ctx := context.Background()

	const workers = 20
	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			size := int64(1)
			err := st.UpsertUploadObjectWithByteLimit(ctx, UploadObject{
				UploadID:     session.ID,
				ProfileID:    profile.ID,
				Path:         fmt.Sprintf("file-%02d.bin", i),
				Bucket:       session.Bucket,
				ObjectKey:    fmt.Sprintf("incoming/file-%02d.bin", i),
				ExpectedSize: &size,
			}, 10)
			errs <- err
		}(i)
	}

	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	limitErrors := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrUploadSessionBytesExceeded):
			limitErrors++
		default:
			t.Fatalf("unexpected reservation error: %v", err)
		}
	}
	if successes != 10 || limitErrors != 10 {
		t.Fatalf("successes=%d limitErrors=%d, want 10/10", successes, limitErrors)
	}
	assertUploadSessionBytes(t, st, profile.ID, session.ID, 10)
}

func TestAddUploadSessionBytesWithinLimitRejectsConcurrentOverage(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	testAddUploadSessionBytesWithinLimitRejectsConcurrentOverage(t, st)
}

func testAddUploadSessionBytesWithinLimitRejectsConcurrentOverage(t *testing.T, st *Store) {
	t.Helper()
	profile, session := createUploadObjectTestSession(t, st)
	ctx := context.Background()

	const workers = 20
	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs <- st.AddUploadSessionBytesWithinLimit(ctx, profile.ID, session.ID, 1, 10)
		}()
	}

	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	limitErrors := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrUploadSessionBytesExceeded):
			limitErrors++
		default:
			t.Fatalf("unexpected byte reservation error: %v", err)
		}
	}
	if successes != 10 || limitErrors != 10 {
		t.Fatalf("successes=%d limitErrors=%d, want 10/10", successes, limitErrors)
	}
	assertUploadSessionBytes(t, st, profile.ID, session.ID, 10)
}

func TestDeleteUploadSessionRollsBackAllMetadataOnFailure(t *testing.T) {
	st := newProfileTestStore(t, Options{})
	testDeleteUploadSessionRollsBackAllMetadataOnFailure(t, st)
}

func testDeleteUploadSessionRollsBackAllMetadataOnFailure(t *testing.T, st *Store) {
	t.Helper()
	profile, session := createUploadObjectTestSession(t, st)
	ctx := context.Background()

	if err := st.UpsertMultipartUpload(ctx, MultipartUpload{
		UploadID: session.ID, ProfileID: profile.ID, Path: "file.bin",
		Bucket: session.Bucket, ObjectKey: "incoming/file.bin", S3UploadID: "multipart-1",
	}); err != nil {
		t.Fatalf("upsert multipart upload: %v", err)
	}
	size := int64(1)
	if err := st.UpsertUploadObject(ctx, UploadObject{
		UploadID: session.ID, ProfileID: profile.ID, Path: "file.bin",
		Bucket: session.Bucket, ObjectKey: "incoming/file.bin", ExpectedSize: &size,
	}); err != nil {
		t.Fatalf("upsert upload object: %v", err)
	}

	injectedErr := errors.New("injected upload session delete failure")
	const callback = "test:fail_upload_session_delete"
	if err := st.db.Callback().Delete().Before("gorm:delete").Register(callback, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "upload_sessions" {
			tx.AddError(injectedErr)
		}
	}); err != nil {
		t.Fatalf("register delete callback: %v", err)
	}
	callbackRegistered := true
	t.Cleanup(func() {
		if callbackRegistered {
			_ = st.db.Callback().Delete().Remove(callback)
		}
	})
	deleted, err := st.DeleteUploadSession(ctx, profile.ID, session.ID)
	if !errors.Is(err, injectedErr) || deleted {
		t.Fatalf("DeleteUploadSession() = (%v, %v), want (false, %v)", deleted, err, injectedErr)
	}
	if err := st.db.Callback().Delete().Remove(callback); err != nil {
		t.Fatalf("remove delete callback: %v", err)
	}
	callbackRegistered = false

	if _, ok, err := st.GetMultipartUpload(ctx, profile.ID, session.ID, "file.bin"); err != nil || !ok {
		t.Fatalf("multipart metadata after rollback = (ok=%v, err=%v), want preserved", ok, err)
	}
	if objects, err := st.ListUploadObjects(ctx, profile.ID, session.ID); err != nil || len(objects) != 1 {
		t.Fatalf("upload objects after rollback = (%d, %v), want one", len(objects), err)
	}
	if _, ok, err := st.GetUploadSession(ctx, profile.ID, session.ID); err != nil || !ok {
		t.Fatalf("upload session after rollback = (ok=%v, err=%v), want preserved", ok, err)
	}

	deleted, err = st.DeleteUploadSession(ctx, profile.ID, session.ID)
	if err != nil || !deleted {
		t.Fatalf("DeleteUploadSession() = (%v, %v), want (true, nil)", deleted, err)
	}
	if _, ok, err := st.GetMultipartUpload(ctx, profile.ID, session.ID, "file.bin"); err != nil || ok {
		t.Fatalf("multipart metadata after delete = (ok=%v, err=%v), want deleted", ok, err)
	}
	if objects, err := st.ListUploadObjects(ctx, profile.ID, session.ID); err != nil || len(objects) != 0 {
		t.Fatalf("upload objects after delete = (%d, %v), want none", len(objects), err)
	}
	if err := st.UpsertMultipartUpload(ctx, MultipartUpload{
		UploadID: session.ID, ProfileID: profile.ID, Path: "late.bin",
		Bucket: session.Bucket, ObjectKey: "incoming/late.bin", S3UploadID: "multipart-late",
	}); !errors.Is(err, ErrUploadSessionNotFound) {
		t.Fatalf("late multipart upsert error=%v, want ErrUploadSessionNotFound", err)
	}
}

func assertUploadSessionBytes(t *testing.T, st *Store, profileID, uploadID string, want int64) {
	t.Helper()
	session, ok, err := st.GetUploadSession(context.Background(), profileID, uploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatalf("expected upload session")
	}
	if session.Bytes != want {
		t.Fatalf("bytes=%d, want %d", session.Bytes, want)
	}
}

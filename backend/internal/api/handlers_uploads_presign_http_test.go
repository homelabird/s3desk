package api

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestUploadPresignHTTPService_HandlePresignUpload_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/presign", bytes.NewBufferString(`{"path":"file.bin"}`))
	rr := httptest.NewRecorder()

	newUploadPresignHTTPService(srv).handlePresignUpload(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
	if resp.Error.Message != "profile and uploadId are required" {
		t.Fatalf("resp.Error.Message=%q, want profile and uploadId are required", resp.Error.Message)
	}
}

func TestUploadPresignHTTPService_HandlePresignUpload_ReturnsInvalidJSON(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	srv := &server{cfg: config.Config{DataDir: dataDir}, store: st}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/presign", bytes.NewBufferString(`{"path":"file.bin"}{`))
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
	req = withUploadIDParam(req, upload.ID)
	rr := httptest.NewRecorder()

	newUploadPresignHTTPService(srv).handlePresignUpload(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_json" {
		t.Fatalf("resp.Error.Code=%q, want invalid_json", resp.Error.Code)
	}
}

func TestUploadPresignHTTPService_HandlePresignUpload_ReturnsInvalidExpiresSeconds(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	srv := &server{cfg: config.Config{DataDir: dataDir}, store: st}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/presign", bytes.NewBufferString(`{"path":"file.bin","expiresSeconds":30}`))
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
	req = withUploadIDParam(req, upload.ID)
	rr := httptest.NewRecorder()

	newUploadPresignHTTPService(srv).handlePresignUpload(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
	if got := resp.Error.Details["expiresSeconds"]; got != float64(30) {
		t.Fatalf("details.expiresSeconds=%v, want 30", got)
	}
}

func TestExecutePresign_PreservesMissingProfileAndUploadID(t *testing.T) {
	svc := newUploadPresignHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/presign", bytes.NewBufferString(`{"path":"file.bin"}`))

	_, uploadErr, _ := svc.executePresign(req)

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
	if uploadErr.message != "profile and uploadId are required" {
		t.Fatalf("uploadErr.message=%q, want profile and uploadId are required", uploadErr.message)
	}
}

func TestExecuteSinglePartRejectsNegativeSize(t *testing.T) {
	svc := newUploadPresignHTTPService(&server{})
	size := int64(-1)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/presign", nil)

	_, uploadErr := svc.executeSinglePart(req, uploadPresignPreparedRequest{
		req: models.UploadPresignRequest{Size: &size},
	})

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.status != http.StatusBadRequest {
		t.Fatalf("uploadErr.status=%d, want %d", uploadErr.status, http.StatusBadRequest)
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
}

func TestExecuteSinglePartRequiresSizeWhenUploadMaxBytesConfigured(t *testing.T) {
	svc := newUploadPresignHTTPService(&server{cfg: config.Config{UploadMaxBytes: 10}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/presign", nil)

	_, uploadErr := svc.executeSinglePart(req, uploadPresignPreparedRequest{
		req: models.UploadPresignRequest{},
	})

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.status != http.StatusBadRequest {
		t.Fatalf("uploadErr.status=%d, want %d", uploadErr.status, http.StatusBadRequest)
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
}

func TestExecuteSinglePartRejectsUploadMaxBytes(t *testing.T) {
	svc := newUploadPresignHTTPService(&server{cfg: config.Config{UploadMaxBytes: 10}})
	size := int64(11)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/presign", nil)

	_, uploadErr := svc.executeSinglePart(req, uploadPresignPreparedRequest{
		req: models.UploadPresignRequest{Size: &size},
	})

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("uploadErr.status=%d, want %d", uploadErr.status, http.StatusRequestEntityTooLarge)
	}
	if uploadErr.code != "too_large" {
		t.Fatalf("uploadErr.code=%q, want too_large", uploadErr.code)
	}
}

func TestExecuteSinglePartRejectsSessionByteReservationOverLimit(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	existingSize := int64(8)
	if err := st.UpsertUploadObjectWithByteLimit(context.Background(), store.UploadObject{
		UploadID:     upload.ID,
		ProfileID:    profile.ID,
		Path:         "existing.bin",
		Bucket:       upload.Bucket,
		ObjectKey:    "incoming/existing.bin",
		ExpectedSize: &existingSize,
	}, 10); err != nil {
		t.Fatalf("seed upload object: %v", err)
	}

	svc := newUploadPresignHTTPService(&server{
		cfg:   config.Config{DataDir: dataDir, UploadMaxBytes: 10},
		store: st,
	})
	size := int64(3)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/presign", nil)

	_, uploadErr := svc.executeSinglePart(req, uploadPresignPreparedRequest{
		profileID: profile.ID,
		uploadID:  upload.ID,
		us:        upload,
		secrets: models.ProfileSecrets{
			ID:              profile.ID,
			Provider:        models.ProfileProviderS3Compatible,
			Endpoint:        "http://127.0.0.1:9000",
			Region:          "us-east-1",
			AccessKeyID:     "access",
			SecretAccessKey: "secret",
			ForcePathStyle:  true,
		},
		req:       models.UploadPresignRequest{Path: "new.bin", Size: &size},
		relPath:   "new.bin",
		key:       "incoming/new.bin",
		expires:   time.Minute,
		expiresAt: time.Now().UTC().Add(time.Minute).Format(time.RFC3339Nano),
	})

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("uploadErr.status=%d, want %d", uploadErr.status, http.StatusRequestEntityTooLarge)
	}
	if uploadErr.code != "too_large" {
		t.Fatalf("uploadErr.code=%q, want too_large", uploadErr.code)
	}

	stored, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.ID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatal("expected upload session")
	}
	if stored.Bytes != existingSize {
		t.Fatalf("bytes=%d, want %d", stored.Bytes, existingSize)
	}
	objects, err := st.ListUploadObjects(context.Background(), profile.ID, upload.ID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(objects) != 1 || objects[0].Path != "existing.bin" {
		t.Fatalf("objects=%#v, want only existing.bin", objects)
	}
}

func TestExecuteMultipartRejectsUploadMaxBytes(t *testing.T) {
	svc := newUploadPresignHTTPService(&server{cfg: config.Config{UploadMaxBytes: 10}})
	fileSize := int64(11)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/presign", nil)

	_, uploadErr := svc.executeMultipart(req, uploadPresignPreparedRequest{
		req: models.UploadPresignRequest{
			Multipart: &models.UploadMultipartPresignReq{
				FileSize:      &fileSize,
				PartSizeBytes: 5 * 1024 * 1024,
			},
		},
	})

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("uploadErr.status=%d, want %d", uploadErr.status, http.StatusRequestEntityTooLarge)
	}
	if uploadErr.code != "too_large" {
		t.Fatalf("uploadErr.code=%q, want too_large", uploadErr.code)
	}
}

func TestExecuteMultipartSerializesCreateForConcurrentPresigns(t *testing.T) {
	var (
		mu           sync.Mutex
		createCount  int
		firstStarted = make(chan struct{})
		releaseFirst = make(chan struct{})
		once         sync.Once
	)
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !r.URL.Query().Has("uploads") {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		mu.Lock()
		createCount++
		current := createCount
		mu.Unlock()
		if current == 1 {
			once.Do(func() { close(firstStarted) })
			<-releaseFirst
		}
		w.Header().Set("Content-Type", "application/xml")
		_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Bucket>test-bucket</Bucket>
	<Key>incoming/file.bin</Key>
	<UploadId>upload-1</UploadId>
</InitiateMultipartUploadResult>`)
	}))
	t.Cleanup(fakeS3.Close)

	st, _, _, dataDir := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	secrets, ok, err := st.GetProfileSecrets(context.Background(), profile.ID)
	if err != nil || !ok {
		t.Fatalf("get profile secrets: ok=%v err=%v", ok, err)
	}

	svc := newUploadPresignHTTPService(&server{cfg: config.Config{DataDir: dataDir}, store: st})
	fileSize := int64(10 * 1024 * 1024)
	prepared := func() uploadPresignPreparedRequest {
		return uploadPresignPreparedRequest{
			profileID: profile.ID,
			uploadID:  upload.ID,
			us:        upload,
			secrets:   secrets,
			req: models.UploadPresignRequest{
				Path: "file.bin",
				Multipart: &models.UploadMultipartPresignReq{
					FileSize:      &fileSize,
					PartSizeBytes: 5 * 1024 * 1024,
					PartNumbers:   []int{1, 2},
				},
			},
			relPath:   "file.bin",
			key:       "incoming/file.bin",
			expires:   time.Minute,
			expiresAt: time.Now().Add(time.Minute).UTC().Format(time.RFC3339Nano),
		}
	}

	var wg sync.WaitGroup
	errs := make(chan *uploadHTTPError, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, uploadErr := svc.executeMultipart(httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/presign", nil), prepared())
			errs <- uploadErr
		}()
	}

	select {
	case <-firstStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for first multipart create")
	}
	close(releaseFirst)
	wg.Wait()
	close(errs)
	for uploadErr := range errs {
		if uploadErr != nil {
			t.Fatalf("executeMultipart error: %v", uploadErr)
		}
	}

	mu.Lock()
	gotCreates := createCount
	mu.Unlock()
	if gotCreates != 1 {
		t.Fatalf("provider multipart creates=%d, want 1", gotCreates)
	}
	meta, found, err := st.GetMultipartUpload(context.Background(), profile.ID, upload.ID, "file.bin")
	if err != nil || !found {
		t.Fatalf("get multipart metadata: found=%v err=%v", found, err)
	}
	if meta.S3UploadID != "upload-1" {
		t.Fatalf("S3UploadID=%q, want upload-1", meta.S3UploadID)
	}
}

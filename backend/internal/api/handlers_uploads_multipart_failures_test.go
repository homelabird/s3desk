package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestCommitUploadDirectMultipartListFailure(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{
		listStatus:     http.StatusInternalServerError,
		listBody:       `<Error><Code>InternalError</Code><Message>list failed</Message></Error>`,
		completeStatus: http.StatusOK,
		completeBody:   `<CompleteMultipartUploadResult/>`,
	})

	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)

	upload := createUploadSessionForMode(t, srv, profile.ID, "direct")
	seedMultipartUploadMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "file.bin", "upload-1", 5, 10)

	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, nil)
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusBadGateway {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 502, got %d: %s", commitRes.StatusCode, string(body))
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, commitRes, &errResp)
	if errResp.Error.Code != "upload_failed" {
		t.Fatalf("expected upload_failed code, got %q", errResp.Error.Code)
	}
	if !strings.Contains(errResp.Error.Message, "list multipart parts") {
		t.Fatalf("expected list multipart parts failure, got %q", errResp.Error.Message)
	}

	_, ok, err := st.GetMultipartUpload(context.Background(), profile.ID, upload.UploadID, "file.bin")
	if err != nil {
		t.Fatalf("get multipart upload: %v", err)
	}
	if !ok {
		t.Fatalf("expected multipart metadata to remain after list failure")
	}
}

func TestUploadFilesDirectMultipartInvalidCreateResponse(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{
		createStatus: http.StatusOK,
		createBody: `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Bucket>test-bucket</Bucket>
	<Key>incoming/file.bin</Key>
</InitiateMultipartUploadResult>`,
	})

	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	upload := createUploadSessionForMode(t, srv, profile.ID, "direct")

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/uploads/"+upload.UploadID+"/files", bytes.NewReader([]byte("hello")))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("X-Upload-Chunk-Index", "0")
	req.Header.Set("X-Upload-Chunk-Total", "2")
	req.Header.Set("X-Upload-Chunk-Size", "5")
	req.Header.Set("X-Upload-File-Size", "10")
	req.Header.Set("X-Upload-Relative-Path", "file.bin")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("upload request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadGateway {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 502, got %d: %s", res.StatusCode, string(body))
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "upload_failed" {
		t.Fatalf("expected upload_failed code, got %q", errResp.Error.Code)
	}

	_, ok, err := st.GetMultipartUpload(context.Background(), profile.ID, upload.UploadID, "file.bin")
	if err != nil {
		t.Fatalf("get multipart upload: %v", err)
	}
	if ok {
		t.Fatalf("expected multipart metadata to remain absent after invalid create response")
	}
}

func TestPresignUploadMultipartInvalidCreateResponse(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{
		createStatus: http.StatusOK,
		createBody: `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Bucket>test-bucket</Bucket>
	<Key>incoming/file.bin</Key>
</InitiateMultipartUploadResult>`,
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	upload := createUploadSessionForMode(t, srv, profile.ID, "presigned")
	fileSize := int64(10 * 1024 * 1024)

	res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/presign", profile.ID, models.UploadPresignRequest{
		Path: "file.bin",
		Multipart: &models.UploadMultipartPresignReq{
			FileSize:      &fileSize,
			PartSizeBytes: 5 * 1024 * 1024,
		},
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadGateway {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 502, got %d: %s", res.StatusCode, string(body))
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "upload_failed" {
		t.Fatalf("expected upload_failed code, got %q", errResp.Error.Code)
	}

	_, ok, err := st.GetMultipartUpload(context.Background(), profile.ID, upload.UploadID, "file.bin")
	if err != nil {
		t.Fatalf("get multipart upload: %v", err)
	}
	if ok {
		t.Fatalf("expected multipart metadata to remain absent after invalid presign create response")
	}
}

func TestCommitUploadDirectMultipartCompleteFailure(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{
		listStatus:     http.StatusOK,
		listBody:       fakeListPartsXML(),
		completeStatus: http.StatusInternalServerError,
		completeBody:   `<Error><Code>InternalError</Code><Message>complete failed</Message></Error>`,
	})

	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)

	upload := createUploadSessionForMode(t, srv, profile.ID, "direct")
	seedMultipartUploadMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "file.bin", "upload-1", 5, 10)

	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, nil)
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusBadGateway {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 502, got %d: %s", commitRes.StatusCode, string(body))
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, commitRes, &errResp)
	if errResp.Error.Code != "upload_failed" {
		t.Fatalf("expected upload_failed code, got %q", errResp.Error.Code)
	}
	if !strings.Contains(errResp.Error.Message, "complete multipart upload") {
		t.Fatalf("expected complete multipart upload failure, got %q", errResp.Error.Message)
	}

	_, ok, err := st.GetMultipartUpload(context.Background(), profile.ID, upload.UploadID, "file.bin")
	if err != nil {
		t.Fatalf("get multipart upload: %v", err)
	}
	if !ok {
		t.Fatalf("expected multipart metadata to remain after complete failure")
	}
}

func TestCommitUploadPresignedMultipartIncomplete(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	upload := createUploadSessionForMode(t, srv, profile.ID, "presigned")
	seedMultipartUploadMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "file.bin", "upload-1", 5, 10)

	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, nil)
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 400, got %d: %s", commitRes.StatusCode, string(body))
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, commitRes, &errResp)
	if errResp.Error.Code != "upload_incomplete" {
		t.Fatalf("expected upload_incomplete code, got %q", errResp.Error.Code)
	}
}

func TestCompleteMultipartUploadFailureKeepsMetadata(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{
		listStatus:     http.StatusOK,
		listBody:       fakeListPartsXML(),
		completeStatus: http.StatusInternalServerError,
		completeBody:   `<Error><Code>InternalError</Code><Message>complete failed</Message></Error>`,
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)

	upload := createUploadSessionForMode(t, srv, profile.ID, "presigned")
	seedMultipartUploadMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "file.bin", "upload-1", 5, 10)

	completeRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/multipart/complete", profile.ID, models.UploadMultipartCompleteRequest{
		Path: "file.bin",
		Parts: []models.UploadMultipartCompletePart{
			{Number: 1, ETag: "etag-1"},
			{Number: 2, ETag: "etag-2"},
		},
	})
	defer completeRes.Body.Close()
	if completeRes.StatusCode != http.StatusBadGateway {
		body, _ := io.ReadAll(completeRes.Body)
		t.Fatalf("expected status 502, got %d: %s", completeRes.StatusCode, string(body))
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, completeRes, &errResp)
	if errResp.Error.Code != "upload_failed" {
		t.Fatalf("expected upload_failed code, got %q", errResp.Error.Code)
	}
	if !strings.Contains(errResp.Error.Message, "complete multipart upload") {
		t.Fatalf("expected complete multipart upload failure, got %q", errResp.Error.Message)
	}

	_, ok, err := st.GetMultipartUpload(context.Background(), profile.ID, upload.UploadID, "file.bin")
	if err != nil {
		t.Fatalf("get multipart upload: %v", err)
	}
	if !ok {
		t.Fatalf("expected multipart metadata to remain after complete failure")
	}
}

func TestCommitUploadQueueFullThenRetrySucceeds(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("JOB_QUEUE_CAPACITY", "1")
	t.Setenv("RCLONE_TUNE", "true")
	installJobsProcessHooks(t, func(_ context.Context, _ string, args []string, _ string, _ jobs.TestRunRcloneAttemptOptions, writeLog func(level string, message string)) (string, error) {
		writeLog("info", "queue-full retry")
		if len(args) == 0 {
			return "", unexpectedRcloneAttemptError(args)
		}
		return "", nil
	})

	st, manager, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	upload := createUploadSessionForMode(t, srv, profile.ID, "staging")

	localDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(localDir, "sample.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatalf("write filler file: %v", err)
	}
	filler := createJob(t, srv, profile.ID, jobs.JobTypeTransferSyncLocalToS3, map[string]any{
		"bucket":    "test-bucket",
		"prefix":    "filler/",
		"localPath": localDir,
	})

	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, nil)
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusTooManyRequests {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 429, got %d: %s", commitRes.StatusCode, string(body))
	}

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go manager.Run(ctx)

	_ = waitForJobStatus(t, srv, profile.ID, filler.ID, models.JobStatusSucceeded, 5*time.Second)

	retryRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, nil)
	defer retryRes.Body.Close()
	if retryRes.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(retryRes.Body)
		t.Fatalf("expected status 201, got %d: %s", retryRes.StatusCode, string(body))
	}
	var created models.JobCreatedResponse
	decodeJSONResponse(t, retryRes, &created)
	if created.JobID == "" {
		t.Fatalf("expected jobId")
	}

	_ = waitForJobStatus(t, srv, profile.ID, created.JobID, models.JobStatusSucceeded, 5*time.Second)
	_, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if ok {
		t.Fatalf("expected upload session to be deleted after retry commit success")
	}
}

func TestTryAssembleChunkFileConcurrentCalls(t *testing.T) {
	t.Parallel()

	stagingDir := t.TempDir()
	relOS := filepath.FromSlash("nested/file.bin")
	chunkDir := filepath.Join(stagingDir, ".chunks", relOS)
	if err := os.MkdirAll(chunkDir, 0o700); err != nil {
		t.Fatalf("mkdir chunk dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(0)), []byte("hello "), 0o600); err != nil {
		t.Fatalf("write chunk 0: %v", err)
	}
	if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(1)), []byte("world"), 0o600); err != nil {
		t.Fatalf("write chunk 1: %v", err)
	}

	var (
		mu       sync.Mutex
		netDelta int64
		wg       sync.WaitGroup
		errCh    = make(chan error, 2)
	)
	assemble := func() {
		defer wg.Done()
		err := tryAssembleChunkFile(stagingDir, relOS, chunkDir, 2, func(delta int64) error {
			mu.Lock()
			netDelta += delta
			mu.Unlock()
			return nil
		})
		errCh <- err
	}

	wg.Add(2)
	go assemble()
	go assemble()
	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			t.Fatalf("expected nil assemble error, got %v", err)
		}
	}

	finalPath := filepath.Join(stagingDir, relOS)
	body, err := os.ReadFile(finalPath)
	if err != nil {
		t.Fatalf("read assembled file: %v", err)
	}
	if string(body) != "hello world" {
		t.Fatalf("unexpected assembled file body: %q", string(body))
	}

	if _, err := os.Stat(chunkDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected chunk dir removed, stat err=%v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if netDelta != 0 {
		t.Fatalf("expected net delta 0, got %d", netDelta)
	}
}

type multipartS3Behavior struct {
	createStatus   int
	createBody     string
	listStatus     int
	listBody       string
	completeStatus int
	completeBody   string
}

func newMultipartS3TestServer(t *testing.T, behavior multipartS3Behavior) *httptest.Server {
	t.Helper()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")

		switch r.Method {
		case http.MethodPost:
			if r.URL.Query().Has("uploads") {
				status := behavior.createStatus
				if status == 0 {
					status = http.StatusOK
				}
				body := behavior.createBody
				if body == "" {
					body = `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Bucket>test-bucket</Bucket>
	<Key>incoming/file.bin</Key>
	<UploadId>upload-1</UploadId>
</InitiateMultipartUploadResult>`
				}
				w.WriteHeader(status)
				_, _ = io.WriteString(w, body)
				return
			}
			if r.URL.Query().Get("uploadId") == "" {
				http.Error(w, "missing uploadId", http.StatusBadRequest)
				return
			}
			status := behavior.completeStatus
			if status == 0 {
				status = http.StatusOK
			}
			body := behavior.completeBody
			if body == "" {
				body = `<CompleteMultipartUploadResult/>`
			}
			w.WriteHeader(status)
			_, _ = io.WriteString(w, body)
		case http.MethodGet:
			if r.URL.Query().Get("uploadId") == "" {
				http.Error(w, "missing uploadId", http.StatusBadRequest)
				return
			}
			status := behavior.listStatus
			if status == 0 {
				status = http.StatusOK
			}
			body := behavior.listBody
			if body == "" {
				body = fakeListPartsXML()
			}
			w.WriteHeader(status)
			_, _ = io.WriteString(w, body)
		case http.MethodPut:
			if r.URL.Query().Get("uploadId") == "" {
				http.Error(w, "missing uploadId", http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusOK)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv
}

func fakeListPartsXML() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Bucket>test-bucket</Bucket>
	<Key>incoming/file.bin</Key>
	<UploadId>upload-1</UploadId>
	<PartNumberMarker>0</PartNumberMarker>
	<NextPartNumberMarker>0</NextPartNumberMarker>
	<MaxParts>1000</MaxParts>
	<IsTruncated>false</IsTruncated>
	<Part>
		<PartNumber>1</PartNumber>
		<LastModified>2026-03-05T00:00:00.000Z</LastModified>
		<ETag>"etag-1"</ETag>
		<Size>5</Size>
	</Part>
	<Part>
		<PartNumber>2</PartNumber>
		<LastModified>2026-03-05T00:00:01.000Z</LastModified>
		<ETag>"etag-2"</ETag>
		<Size>5</Size>
	</Part>
</ListPartsResult>`
}

func createUploadSessionForMode(t *testing.T, srv *httptest.Server, profileID, mode string) models.UploadCreateResponse {
	t.Helper()

	createRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads", profileID, models.UploadCreateRequest{
		Bucket: "test-bucket",
		Prefix: "incoming",
		Mode:   mode,
	})
	defer createRes.Body.Close()
	if createRes.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(createRes.Body)
		t.Fatalf("expected status 201, got %d: %s", createRes.StatusCode, string(body))
	}
	var upload models.UploadCreateResponse
	decodeJSONResponse(t, createRes, &upload)
	if upload.UploadID == "" {
		t.Fatalf("expected upload id")
	}
	return upload
}

func seedMultipartUploadMetadata(
	t *testing.T,
	st *store.Store,
	profileID, uploadID, bucket, prefix, relPath, s3UploadID string,
	chunkSize, fileSize int64,
) {
	t.Helper()

	objectKey := relPath
	if prefix != "" {
		objectKey = path.Join(prefix, relPath)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpsertMultipartUpload(context.Background(), store.MultipartUpload{
		UploadID:   uploadID,
		ProfileID:  profileID,
		Path:       relPath,
		Bucket:     bucket,
		ObjectKey:  objectKey,
		S3UploadID: s3UploadID,
		ChunkSize:  chunkSize,
		FileSize:   fileSize,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert multipart upload: %v", err)
	}
}

func createTestProfileWithEndpoint(t *testing.T, st *store.Store, endpoint string) models.Profile {
	t.Helper()

	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := true

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test-profile",
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
	return profile
}

func newTestJobsServerWithUploadDirect(t *testing.T, encryptionKey string, startManager bool, uploadDirectStream bool) (*store.Store, *jobs.Manager, *httptest.Server, string) {
	t.Helper()

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

	st, err := store.New(gormDB, store.Options{
		EncryptionKey: encryptionKey,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	hub := ws.NewHub()
	manager := jobs.NewManager(jobs.Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              hub,
		Concurrency:      1,
		JobLogMaxBytes:   0,
		JobRetention:     0,
		AllowedLocalDirs: nil,
		UploadSessionTTL: time.Minute,
	})

	handler := New(Dependencies{
		Config: config.Config{
			Addr:               "127.0.0.1:0",
			DataDir:            dataDir,
			DBBackend:          string(db.BackendSQLite),
			StaticDir:          dataDir,
			EncryptionKey:      encryptionKey,
			JobConcurrency:     1,
			UploadSessionTTL:   time.Minute,
			UploadDirectStream: uploadDirectStream,
		},
		Store:      st,
		Jobs:       manager,
		Hub:        hub,
		ServerAddr: "127.0.0.1:0",
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	if startManager {
		ctx, cancel := context.WithCancel(context.Background())
		t.Cleanup(cancel)
		go manager.Run(ctx)
	}

	return st, manager, srv, dataDir
}

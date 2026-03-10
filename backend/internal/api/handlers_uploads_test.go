package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestSanitizeUploadPath(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{in: "", want: ""},
		{in: "   ", want: ""},
		{in: ".", want: ""},
		{in: "..", want: ""},
		{in: "/", want: ""},
		{in: "a.txt", want: "a.txt"},
		{in: "a/b.txt", want: "a/b.txt"},
		{in: "a\\b\\c.txt", want: "a/b/c.txt"},
		{in: "../c.txt", want: ""},
		{in: "a/../c.txt", want: "c.txt"},
		{in: "dir/", want: "dir"},
		{in: "  spaced name.txt  ", want: "spaced name.txt"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.in, func(t *testing.T) {
			t.Parallel()
			got := sanitizeUploadPath(tc.in)
			if got != tc.want {
				t.Fatalf("sanitizeUploadPath(%q)=%q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestCommitUploadQueueFullRollsBackCreatedJob(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("JOB_QUEUE_CAPACITY", "1")
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return "rclone", "rclone v1.66.0", nil
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	createRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads", profile.ID, models.UploadCreateRequest{
		Bucket: "test-bucket",
		Mode:   "staging",
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

	_ = createJob(t, srv, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
		"bucket": "test-bucket",
		"keys":   []any{"filler.txt"},
	})

	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, nil)
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusTooManyRequests {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 429, got %d: %s", commitRes.StatusCode, string(body))
	}
	if retry := commitRes.Header.Get("Retry-After"); retry != "2" {
		t.Fatalf("expected Retry-After 2, got %q", retry)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, commitRes, &errResp)
	if errResp.Error.Code != "job_queue_full" {
		t.Fatalf("expected job_queue_full, got %q", errResp.Error.Code)
	}

	jobType := jobs.JobTypeTransferSyncStagingToS3
	listed, err := st.ListJobs(context.Background(), profile.ID, store.JobFilter{Type: &jobType, Limit: 10})
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if len(listed.Items) != 0 {
		t.Fatalf("expected no persisted staging commit jobs, got %d", len(listed.Items))
	}

	_, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatalf("expected upload session to remain after queue-full commit failure")
	}
}

func TestTryAssembleChunkFile_DeltaError(t *testing.T) {
	t.Parallel()

	stagingDir := t.TempDir()
	relOS := filepath.FromSlash("nested/file.bin")
	chunkDir := filepath.Join(stagingDir, ".chunks", relOS)
	if err := os.MkdirAll(chunkDir, 0o700); err != nil {
		t.Fatalf("mkdir chunk dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(0)), []byte("hello"), 0o600); err != nil {
		t.Fatalf("write chunk 0: %v", err)
	}
	if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(1)), []byte("world"), 0o600); err != nil {
		t.Fatalf("write chunk 1: %v", err)
	}

	var deltas []int64
	err := tryAssembleChunkFile(stagingDir, relOS, chunkDir, 2, func(delta int64) error {
		deltas = append(deltas, delta)
		if delta > 0 {
			return errors.New("store update failed")
		}
		return nil
	})
	if err == nil {
		t.Fatalf("expected delta error, got nil")
	}
	if !strings.Contains(err.Error(), "apply upload byte delta") {
		t.Fatalf("expected apply upload byte delta error, got %v", err)
	}
	if len(deltas) != 1 || deltas[0] <= 0 {
		t.Fatalf("expected only one positive delta callback, got %v", deltas)
	}

	finalPath := filepath.Join(stagingDir, relOS)
	if _, statErr := os.Stat(finalPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("expected no assembled file, stat err=%v", statErr)
	}
}

func TestUploadMultipartAndCommitLifecycle(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_TUNE", "true")
	installJobsProcessHooks(t, func(_ context.Context, _ string, args []string, _ string, _ jobs.TestRunRcloneAttemptOptions, writeLog func(level string, message string)) (string, error) {
		writeLog("info", "multipart flow")
		if len(args) == 0 {
			return "", unexpectedRcloneAttemptError(args)
		}
		return "", nil
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), true)
	profile := createTestProfile(t, st)

	createRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads", profile.ID, models.UploadCreateRequest{
		Bucket: "test-bucket",
		Prefix: "incoming",
		Mode:   "staging",
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

	uploadPath := "readme.txt"
	uploadBody := []byte("hello multipart upload")
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", uploadPath)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := part.Write(uploadBody); err != nil {
		t.Fatalf("write multipart body: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/uploads/"+upload.UploadID+"/files", &body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	uploadRes, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do upload request: %v", err)
	}
	defer uploadRes.Body.Close()
	if uploadRes.StatusCode != http.StatusNoContent {
		raw, _ := io.ReadAll(uploadRes.Body)
		t.Fatalf("expected status 204, got %d: %s", uploadRes.StatusCode, string(raw))
	}

	us, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatalf("expected upload session")
	}
	if us.Bytes != int64(len(uploadBody)) {
		t.Fatalf("expected tracked bytes %d, got %d", len(uploadBody), us.Bytes)
	}
	assembledPath := filepath.Join(us.StagingDir, filepath.FromSlash(uploadPath))
	gotBody, err := os.ReadFile(assembledPath)
	if err != nil {
		t.Fatalf("read assembled file: %v", err)
	}
	if string(gotBody) != string(uploadBody) {
		t.Fatalf("unexpected assembled file body: %q", string(gotBody))
	}

	totalFiles := 1
	totalBytes := int64(len(uploadBody))
	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, map[string]any{
		"totalFiles": totalFiles,
		"totalBytes": totalBytes,
		"items": []map[string]any{
			{"path": uploadPath, "size": totalBytes},
		},
	})
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusCreated {
		raw, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 201, got %d: %s", commitRes.StatusCode, string(raw))
	}

	var created models.JobCreatedResponse
	decodeJSONResponse(t, commitRes, &created)
	if created.JobID == "" {
		t.Fatalf("expected jobId")
	}

	completed := waitForJobStatus(t, srv, profile.ID, created.JobID, models.JobStatusSucceeded, 5*time.Second)
	if completed.Type != jobs.JobTypeTransferSyncStagingToS3 {
		t.Fatalf("expected job type %q, got %q", jobs.JobTypeTransferSyncStagingToS3, completed.Type)
	}

	_, ok, err = st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session after commit: %v", err)
	}
	if ok {
		t.Fatalf("expected upload session to be deleted after successful commit")
	}
}

func TestUploadChunkAndCommitLifecycle(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_TUNE", "true")
	installJobsProcessHooks(t, func(_ context.Context, _ string, args []string, _ string, _ jobs.TestRunRcloneAttemptOptions, writeLog func(level string, message string)) (string, error) {
		writeLog("info", "chunk flow")
		if len(args) == 0 {
			return "", unexpectedRcloneAttemptError(args)
		}
		return "", nil
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), true)
	profile := createTestProfile(t, st)

	createRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads", profile.ID, models.UploadCreateRequest{
		Bucket: "test-bucket",
		Prefix: "incoming",
		Mode:   "staging",
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

	uploadPath := "chunked/payload.txt"
	chunk0 := []byte("hello ")
	chunk1 := []byte("world")
	chunkSize := len(chunk0)
	fileSize := len(chunk0) + len(chunk1)

	sendChunk := func(index int, payload []byte) {
		req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/uploads/"+upload.UploadID+"/files", bytes.NewReader(payload))
		if err != nil {
			t.Fatalf("new chunk request: %v", err)
		}
		req.Header.Set("X-Profile-Id", profile.ID)
		req.Header.Set("X-Upload-Chunk-Index", strconv.Itoa(index))
		req.Header.Set("X-Upload-Chunk-Total", "2")
		req.Header.Set("X-Upload-Relative-Path", uploadPath)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("do chunk request: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusNoContent {
			raw, _ := io.ReadAll(res.Body)
			t.Fatalf("expected status 204, got %d: %s", res.StatusCode, string(raw))
		}
	}

	sendChunk(0, chunk0)

	chunksURL := srv.URL + "/api/v1/uploads/" + upload.UploadID + "/chunks?path=" + url.QueryEscape(uploadPath) +
		"&total=2&chunkSize=" + strconv.Itoa(chunkSize) + "&fileSize=" + strconv.Itoa(fileSize)
	stateReq, err := http.NewRequest(http.MethodGet, chunksURL, nil)
	if err != nil {
		t.Fatalf("new chunks request: %v", err)
	}
	stateReq.Header.Set("X-Profile-Id", profile.ID)
	stateRes, err := http.DefaultClient.Do(stateReq)
	if err != nil {
		t.Fatalf("do chunks request: %v", err)
	}
	defer stateRes.Body.Close()
	if stateRes.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(stateRes.Body)
		t.Fatalf("expected status 200, got %d: %s", stateRes.StatusCode, string(raw))
	}
	var state models.UploadChunkState
	decodeJSONResponse(t, stateRes, &state)
	if len(state.Present) != 1 || state.Present[0] != 0 {
		t.Fatalf("expected only first chunk to be present, got %v", state.Present)
	}

	sendChunk(1, chunk1)

	us, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatalf("expected upload session")
	}
	if us.Bytes != int64(fileSize) {
		t.Fatalf("expected tracked bytes %d, got %d", fileSize, us.Bytes)
	}
	finalPath := filepath.Join(us.StagingDir, filepath.FromSlash(uploadPath))
	body, err := os.ReadFile(finalPath)
	if err != nil {
		t.Fatalf("read assembled chunk file: %v", err)
	}
	if string(body) != "hello world" {
		t.Fatalf("unexpected assembled chunk file body: %q", string(body))
	}

	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, map[string]any{
		"totalFiles": 1,
		"totalBytes": int64(fileSize),
		"items": []map[string]any{
			{"path": uploadPath, "size": int64(fileSize)},
		},
	})
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusCreated {
		raw, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 201, got %d: %s", commitRes.StatusCode, string(raw))
	}
	var created models.JobCreatedResponse
	decodeJSONResponse(t, commitRes, &created)
	if created.JobID == "" {
		t.Fatalf("expected jobId")
	}

	_ = waitForJobStatus(t, srv, profile.ID, created.JobID, models.JobStatusSucceeded, 5*time.Second)
	_, ok, err = st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session after commit: %v", err)
	}
	if ok {
		t.Fatalf("expected upload session to be deleted after successful chunk commit")
	}
}

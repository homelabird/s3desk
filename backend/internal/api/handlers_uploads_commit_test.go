package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestExecuteStagingReportsIncompatibleRclone(t *testing.T) {
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return "", "", &jobs.RcloneIncompatibleError{
			CurrentVersion: "rclone v1.51.0",
			MinVersion:     "1.52.0",
			Reason:         "version too old",
		}
	})

	_, uploadErr := (uploadCommitExecutionService{server: &server{}}).executeStaging(
		context.Background(),
		"profile-1",
		map[string]any{},
	)
	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "transfer_engine_incompatible" {
		t.Fatalf("code=%q, want transfer_engine_incompatible", uploadErr.code)
	}
	if uploadErr.details["minVersion"] != "1.52.0" {
		t.Fatalf("minVersion=%v, want 1.52.0", uploadErr.details["minVersion"])
	}
}

func TestBuildVerifiedUploadCommitArtifactsUsesVerifiedState(t *testing.T) {
	artifacts := newUploadCommitArtifactService().buildFromVerified("upload-1", store.UploadSession{
		Bucket: "bucket-a",
		Prefix: "incoming",
	}, uploadCommitRequest{
		Label:    "  import  ",
		RootName: "  docs  ",
		RootKind: "folder",
	}, []verifiedUploadObject{
		{Path: "docs/readme.txt", Key: "incoming/docs/readme.txt", Size: 11, ETag: "etag-readme"},
		{Path: "docs/notes.txt", Key: "incoming/docs/notes.txt", Size: 3},
	}, true, false)

	if artifacts.payload["label"] != "import" {
		t.Fatalf("expected trimmed label, got %#v", artifacts.payload["label"])
	}
	if artifacts.payload["rootName"] != "docs" {
		t.Fatalf("expected trimmed rootName, got %#v", artifacts.payload["rootName"])
	}
	if artifacts.payload["rootKind"] != "folder" {
		t.Fatalf("expected rootKind folder, got %#v", artifacts.payload["rootKind"])
	}

	items, ok := artifacts.payload["items"].([]map[string]any)
	if !ok {
		t.Fatalf("expected cleaned items payload")
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 cleaned items, got %d", len(items))
	}
	if items[0]["key"] != "incoming/docs/readme.txt" {
		t.Fatalf("expected prefixed key, got %#v", items[0]["key"])
	}
	if items[0]["size"] != int64(11) {
		t.Fatalf("expected verified size, got %#v", items[0]["size"])
	}
	if items[0]["etag"] != "etag-readme" {
		t.Fatalf("expected verified etag, got %#v", items[0]["etag"])
	}
	if etag, ok := items[1]["etag"]; !ok || etag != "" {
		t.Fatalf("expected verified empty etag, got %#v", items[1])
	}
	if got := artifacts.payload["totalFiles"]; got != 2 {
		t.Fatalf("expected totalFiles 2, got %#v", got)
	}
	if got := artifacts.payload["totalBytes"]; got != int64(14) {
		t.Fatalf("expected totalBytes 14, got %#v", got)
	}
	if len(artifacts.indexEntries) != 2 {
		t.Fatalf("expected 2 indexed items, got %d", len(artifacts.indexEntries))
	}
	if artifacts.progress == nil || artifacts.progress.BytesTotal == nil || *artifacts.progress.BytesTotal != int64(14) {
		t.Fatalf("expected progress bytes total 14, got %+v", artifacts.progress)
	}
}

func TestCommitDirectNonS3UsesRcloneVerification(t *testing.T) {
	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createAzureBlobSmokeProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	size := int64(5)
	if err := st.UpsertUploadObject(context.Background(), store.UploadObject{
		UploadID:     upload.ID,
		ProfileID:    profile.ID,
		Path:         "nested/file.bin",
		Bucket:       "test-bucket",
		ObjectKey:    "incoming/nested/file.bin",
		ExpectedSize: &size,
	}); err != nil {
		t.Fatalf("seed upload object: %v", err)
	}

	var calls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		calls = append(calls, append([]string(nil), args...))
		return `{"Size":5,"ModTime":"2026-08-06T12:00:00Z","Hashes":{"MD5":"abc123"}}`, "", nil
	})

	res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.ID+"/commit", profile.ID, map[string]any{
		"items": []map[string]any{{"path": "nested/file.bin", "size": size}},
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d: %s", res.StatusCode, http.StatusCreated, string(body))
	}
	if len(calls) != 1 || len(calls[0]) != 4 || calls[0][0] != "lsjson" || calls[0][1] != "--stat" || calls[0][2] != "--hash" {
		t.Fatalf("rclone calls=%v, want one lsjson --stat --hash call", calls)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if ok {
		t.Fatal("expected committed upload session to be removed")
	}
}

func TestCommitDirectNonS3BatchesRcloneVerification(t *testing.T) {
	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createAzureBlobSmokeProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	for _, obj := range []store.UploadObject{
		{Path: "a.bin", ObjectKey: "incoming/a.bin", ExpectedSize: ptrInt64(5)},
		{Path: "b.bin", ObjectKey: "incoming/b.bin", ExpectedSize: ptrInt64(7)},
	} {
		obj.UploadID = upload.ID
		obj.ProfileID = profile.ID
		obj.Bucket = "test-bucket"
		if err := st.UpsertUploadObject(context.Background(), obj); err != nil {
			t.Fatalf("seed upload object %s: %v", obj.Path, err)
		}
	}

	var calls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		calls = append(calls, append([]string(nil), args...))
		if len(args) != 8 {
			t.Fatalf("rclone args=%v, want batch lsjson args", args)
		}
		keys, err := os.ReadFile(args[6])
		if err != nil {
			t.Fatalf("read batch keys: %v", err)
		}
		if got, want := string(keys), "incoming/a.bin\nincoming/b.bin\n"; got != want {
			t.Fatalf("batch keys=%q, want %q", got, want)
		}
		return `[
			{"Path":"incoming/b.bin","Size":7,"ModTime":"2026-08-06T12:00:01Z","Hashes":{"MD5":"etag-b"}},
			{"Path":"incoming/a.bin","Size":5,"ModTime":"2026-08-06T12:00:00Z","Hashes":{"MD5":"etag-a"}}
		]`, "", nil
	})

	res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.ID+"/commit", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d: %s", res.StatusCode, http.StatusCreated, string(body))
	}
	if len(calls) != 1 || calls[0][0] != "lsjson" || calls[0][1] != "--recursive" || calls[0][2] != "--files-only" || calls[0][3] != "--no-mimetype" || calls[0][4] != "--hash" || calls[0][5] != "--files-from-raw" || calls[0][7] != "remote:test-bucket" {
		t.Fatalf("rclone calls=%v, want one batch lsjson call", calls)
	}

	var created models.JobCreatedResponse
	decodeJSONResponse(t, res, &created)
	job, ok, err := st.GetJob(context.Background(), profile.ID, created.JobID)
	if err != nil || !ok {
		t.Fatalf("get committed job: ok=%v err=%v", ok, err)
	}
	items, ok := job.Payload["items"].([]any)
	if !ok || len(items) != 2 {
		t.Fatalf("job items=%#v, want two items", job.Payload["items"])
	}
	first, ok := items[0].(map[string]any)
	if !ok || first["path"] != "a.bin" || first["etag"] != "etag-a" {
		t.Fatalf("first job item=%#v, want original target order and etag-a", items[0])
	}
}

func TestVerifyTargetsRcloneFallsBackToPerObjectAttribution(t *testing.T) {
	var calls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		calls = append(calls, append([]string(nil), args...))
		switch len(calls) {
		case 1:
			return "[", "", nil
		case 2:
			return `{"Size":5}`, "", nil
		default:
			return "", "object not found", errors.New("exit status 3")
		}
	})

	_, uploadErr := (uploadCommitVerificationService{server: &server{}}).verifyTargetsRclone(
		context.Background(),
		models.ProfileSecrets{Provider: models.ProfileProviderAwsS3},
		[]uploadVerificationTarget{
			{Path: "a.bin", Bucket: "test-bucket", Key: "incoming/a.bin", ExpectedSize: ptrInt64(5)},
			{Path: "b.bin", Bucket: "test-bucket", Key: "incoming/b.bin", ExpectedSize: ptrInt64(7)},
		},
	)
	if uploadErr == nil || uploadErr.code != "upload_incomplete" || uploadErr.details["path"] != "b.bin" {
		t.Fatalf("upload error=%+v, want missing b.bin attribution", uploadErr)
	}
	if len(calls) != 3 || calls[1][1] != "--stat" || calls[2][3] != "remote:test-bucket/incoming/b.bin" {
		t.Fatalf("rclone calls=%v, want one batch then ordered per-object fallback", calls)
	}
}

func TestBuildCompletedMultipartPartsRequiresSequentialParts(t *testing.T) {
	part1 := int32(1)
	part3 := int32(3)
	etag1 := "\"etag-1\""
	etag3 := "\"etag-3\""

	_, err := buildCompletedMultipartParts([]types.Part{
		{PartNumber: &part1, ETag: &etag1},
		{PartNumber: &part3, ETag: &etag3},
	}, 3)
	if !errors.Is(err, errUploadIncomplete) {
		t.Fatalf("expected errUploadIncomplete, got %v", err)
	}
}

func TestHandleCommitUploadRejectsTrailingJSON(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	upload := createUploadSessionForMode(t, srv, profile.ID, "staging")

	res := doRawJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, `{"label":"first"}{"label":"second"}`)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 400, got %d: %s", res.StatusCode, string(body))
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_json" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "invalid_json")
	}
}

func TestHandleCommitUploadRejectsOversizedJSONBody(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	upload := createUploadSessionForMode(t, srv, profile.ID, "staging")

	body := `{"label":"` + strings.Repeat("a", int(uploadCommitJSONRequestBodyMaxBytes)) + `"}`
	res := doRawJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, body)
	defer res.Body.Close()
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		raw, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 413, got %d: %s", res.StatusCode, string(raw))
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "too_large" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "too_large")
	}
	if got := resp.Error.Details["maxBytes"]; got != float64(uploadCommitJSONRequestBodyMaxBytes) {
		t.Fatalf("details.maxBytes=%v, want %d", got, uploadCommitJSONRequestBodyMaxBytes)
	}
}

func TestHandleCommitUploadRejectsPendingStagingChunks(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	upload := createUploadSessionForMode(t, srv, profile.ID, "staging")

	us, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatal("expected upload session")
	}

	chunkPath := filepath.Join(us.StagingDir, ".chunks", "nested", "file.bin", chunkPartName(0))
	if err := os.MkdirAll(filepath.Dir(chunkPath), 0o700); err != nil {
		t.Fatalf("mkdir chunk dir: %v", err)
	}
	if err := os.WriteFile(chunkPath, []byte("partial"), 0o600); err != nil {
		t.Fatalf("write chunk: %v", err)
	}

	res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, map[string]any{
		"totalFiles": 1,
		"items": []map[string]any{
			{"path": "nested/file.bin", "size": int64(12)},
		},
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		raw, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 400, got %d: %s", res.StatusCode, string(raw))
	}
	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Message != "upload has incomplete staged chunks" {
		t.Fatalf("error.message=%q, want upload has incomplete staged chunks", resp.Error.Message)
	}
}

func TestUploadCommitFinalizeService_FinalizeImmediateCleansSessionStateAndPublishesCompletion(t *testing.T) {
	ctx := context.Background()
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	us, err := st.CreateUploadSession(ctx, profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	size := int64(11)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpsertUploadObject(ctx, store.UploadObject{
		UploadID:     us.ID,
		ProfileID:    profile.ID,
		Path:         "docs/readme.txt",
		Bucket:       us.Bucket,
		ObjectKey:    "incoming/docs/readme.txt",
		ExpectedSize: &size,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatalf("upsert upload object: %v", err)
	}
	if err := st.UpsertMultipartUpload(ctx, store.MultipartUpload{
		UploadID:   us.ID,
		ProfileID:  profile.ID,
		Path:       "docs/readme.txt",
		Bucket:     us.Bucket,
		ObjectKey:  "incoming/docs/readme.txt",
		S3UploadID: "multipart-1",
		ChunkSize:  5,
		FileSize:   size,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert multipart upload: %v", err)
	}

	hub := ws.NewHub()
	client := hub.Subscribe()
	defer hub.Unsubscribe(client)

	bytesDone := size
	progress := &models.JobProgress{
		BytesDone:  &bytesDone,
		BytesTotal: &bytesDone,
	}
	srv := &server{store: st, hub: hub}

	job, uploadErr := newUploadCommitFinalizeService(srv).finalizeImmediate(
		ctx,
		profile.ID,
		us.ID,
		us,
		map[string]any{"uploadId": us.ID},
		progress,
		[]store.ObjectIndexEntry{{
			Key:          "incoming/docs/readme.txt",
			Size:         size,
			ETag:         "\"etag-1\"",
			LastModified: now,
		}},
	)
	if uploadErr != nil {
		t.Fatalf("finalizeImmediate: %v", uploadErr)
	}
	if job.Status != models.JobStatusSucceeded {
		t.Fatalf("job.Status=%s, want %s", job.Status, models.JobStatusSucceeded)
	}
	if job.Progress == nil || job.Progress.BytesTotal == nil || *job.Progress.BytesTotal != size {
		t.Fatalf("job.Progress=%+v, want bytesTotal %d", job.Progress, size)
	}

	savedJob, ok, err := st.GetJob(ctx, profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok {
		t.Fatal("expected finalized job to exist")
	}
	if savedJob.Status != models.JobStatusSucceeded {
		t.Fatalf("savedJob.Status=%s, want %s", savedJob.Status, models.JobStatusSucceeded)
	}

	_, ok, err = st.GetUploadSession(ctx, profile.ID, us.ID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if ok {
		t.Fatal("expected upload session to be deleted")
	}
	uploadObjects, err := st.ListUploadObjects(ctx, profile.ID, us.ID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(uploadObjects) != 0 {
		t.Fatalf("expected upload objects cleanup, got %d", len(uploadObjects))
	}
	multipartUploads, err := st.ListMultipartUploads(ctx, profile.ID, us.ID)
	if err != nil {
		t.Fatalf("list multipart uploads: %v", err)
	}
	if len(multipartUploads) != 0 {
		t.Fatalf("expected multipart uploads cleanup, got %d", len(multipartUploads))
	}

	summary, err := st.SummarizeObjectIndex(ctx, profile.ID, store.SummarizeObjectIndexInput{
		Bucket:      us.Bucket,
		SampleLimit: 5,
	})
	if err != nil {
		t.Fatalf("summarize object index: %v", err)
	}
	if summary.ObjectCount != 1 {
		t.Fatalf("summary.ObjectCount=%d, want 1", summary.ObjectCount)
	}
	if summary.TotalBytes != size {
		t.Fatalf("summary.TotalBytes=%d, want %d", summary.TotalBytes, size)
	}

	select {
	case msg := <-client.Messages():
		if msg.Type != "job.completed" {
			t.Fatalf("msg.Type=%q, want job.completed", msg.Type)
		}
		var evt ws.Event
		if err := json.Unmarshal(msg.Data, &evt); err != nil {
			t.Fatalf("unmarshal event: %v", err)
		}
		if evt.JobID != job.ID {
			t.Fatalf("evt.JobID=%q, want %q", evt.JobID, job.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("expected completion event")
	}

	select {
	case msg := <-client.Messages():
		t.Fatalf("unexpected extra event %q", msg.Type)
	case <-time.After(25 * time.Millisecond):
	}
}

func doRawJSONRequestWithProfile(t *testing.T, srv *httptest.Server, method, path, profileID, body string) *http.Response {
	t.Helper()

	req, err := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("X-Profile-Id", profileID)
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return res
}

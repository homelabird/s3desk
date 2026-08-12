package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestUploadDirectHTTPService_HandleDirectMultipartChunkUpload_ReturnsInvalidChunkHeader(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))
	rr := httptest.NewRecorder()

	newUploadDirectHTTPService(srv).handleDirectMultipartChunkUpload(rr, req, "profile-1", "upload-1", store.UploadSession{Bucket: "test-bucket"}, "bad")

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
}

func TestUploadDirectHTTPService_HandleDirectMultipartFormUpload_ReturnsMissingProfileSecrets(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("hello")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()

	newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, "profile-1", "upload-1", store.UploadSession{
		Bucket:    "test-bucket",
		ExpiresAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
	})

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusInternalServerError)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "internal_error" {
		t.Fatalf("resp.Error.Code=%q, want internal_error", resp.Error.Code)
	}
}

func TestUploadDirectHTTPService_ExecuteChunkRequest_PreservesInvalidChunkHeader(t *testing.T) {
	svc := newUploadDirectHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))

	_, _, uploadErr := svc.executeDirectMultipartChunkUpload(req, "profile-1", "upload-1", store.UploadSession{Bucket: "test-bucket"}, "bad")

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
}

func TestUploadDirectHTTPService_FormUploadLimitsRemainingBytesFromSession(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, 8); err != nil {
		t.Fatalf("seed upload bytes: %v", err)
	}
	upload, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.ID)
	if err != nil {
		t.Fatalf("reload upload session: %v", err)
	}
	if !ok {
		t.Fatal("expected upload session")
	}

	var captureCalls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		captureCalls = append(captureCalls, append([]string(nil), args...))
		return "", "", nil
	})
	var stdinCalls [][]string
	streamedBytes := -1
	installAPIRcloneStdinHook(t, func(_ models.ProfileSecrets, args []string, stdin io.Reader) (string, error) {
		stdinCalls = append(stdinCalls, append([]string(nil), args...))
		payload, err := io.ReadAll(stdin)
		if err != nil {
			t.Fatalf("read stdin: %v", err)
		}
		streamedBytes = len(payload)
		return "", nil
	})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("abcdef")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, profile.ID, upload.ID, upload)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusRequestEntityTooLarge)
	}
	if streamedBytes != 3 {
		t.Fatalf("streamedBytes=%d, want remaining+1 sentinel bytes", streamedBytes)
	}
	assertRcloneStdinTempTarget(t, stdinCalls, upload.ID, "incoming/file.bin")
	assertRcloneDeletefileTempTarget(t, captureCalls, upload.ID, "incoming/file.bin")
	assertNoRcloneCommand(t, captureCalls, "moveto")
	assertNoRcloneFinalKeyDeletefile(t, captureCalls, "incoming/file.bin")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 8)
}

func TestUploadDirectHTTPService_FormUploadDeletesTempObjectAfterReservationRace(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	var captureCalls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		captureCalls = append(captureCalls, append([]string(nil), args...))
		return "", "", nil
	})
	var stdinCalls [][]string
	installAPIRcloneStdinHook(t, func(_ models.ProfileSecrets, args []string, stdin io.Reader) (string, error) {
		stdinCalls = append(stdinCalls, append([]string(nil), args...))
		if _, err := io.ReadAll(stdin); err != nil {
			t.Fatalf("read stdin: %v", err)
		}
		if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, 9); err != nil {
			t.Fatalf("simulate reservation race: %v", err)
		}
		return "", nil
	})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("ab")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, profile.ID, upload.ID, upload)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusRequestEntityTooLarge)
	}
	assertRcloneStdinTempTarget(t, stdinCalls, upload.ID, "incoming/file.bin")
	assertRcloneDeletefileTempTarget(t, captureCalls, upload.ID, "incoming/file.bin")
	assertNoRcloneCommand(t, captureCalls, "moveto")
	assertNoRcloneFinalKeyDeletefile(t, captureCalls, "incoming/file.bin")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 9)
	assertUploadObjectCount(t, st, profile.ID, upload.ID, 0)
}

func TestUploadDirectHTTPService_FormUploadPreservesRelativePathAndPromotesTempObject(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	var captureCalls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		captureCalls = append(captureCalls, append([]string(nil), args...))
		return "", "", nil
	})
	var stdinCalls [][]string
	installAPIRcloneStdinHook(t, func(_ models.ProfileSecrets, args []string, stdin io.Reader) (string, error) {
		stdinCalls = append(stdinCalls, append([]string(nil), args...))
		payload, err := io.ReadAll(stdin)
		if err != nil {
			t.Fatalf("read stdin: %v", err)
		}
		if string(payload) != "hello" {
			t.Fatalf("payload=%q, want hello", string(payload))
		}
		return "", nil
	})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("hello")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("X-Upload-Relative-Path", "nested/file.bin")
	req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, profile.ID, upload.ID, upload)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		raw, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d: %s", res.StatusCode, http.StatusNoContent, string(raw))
	}
	assertRcloneStdinTempTarget(t, stdinCalls, upload.ID, "incoming/nested/file.bin")
	assertRcloneMovetoTempToFinal(t, captureCalls, upload.ID, "incoming/nested/file.bin")
	assertNoRcloneCommand(t, captureCalls, "deletefile")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 5)

	objects, err := st.ListUploadObjects(context.Background(), profile.ID, upload.ID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(objects) != 1 {
		t.Fatalf("len(objects)=%d, want 1", len(objects))
	}
	if objects[0].ObjectKey != "incoming/nested/file.bin" {
		t.Fatalf("object key=%q, want incoming/nested/file.bin", objects[0].ObjectKey)
	}
}

func TestUploadDirectHTTPService_FormUploadRollsBackReservationWhenPromotionFails(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	var captureCalls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		captureCalls = append(captureCalls, append([]string(nil), args...))
		if len(args) > 0 && args[0] == "moveto" {
			return "", "move failed secret_access_key=stderr-secret", errors.New("exit status 1 api_token=error-secret")
		}
		if len(args) > 0 && args[0] == "deletefile" {
			return "", "cleanup failed secret_access_key=cleanup-secret", errors.New("exit status 1 api_token=cleanup-error-secret")
		}
		return "", "", nil
	})
	installAPIRcloneStdinHook(t, func(_ models.ProfileSecrets, _ []string, stdin io.Reader) (string, error) {
		if _, err := io.ReadAll(stdin); err != nil {
			t.Fatalf("read stdin: %v", err)
		}
		return "", nil
	})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("hello")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, profile.ID, upload.ID, upload)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusInternalServerError)
	}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	bodyText := string(raw)
	for _, secret := range []string{"stderr-secret", "error-secret"} {
		if strings.Contains(bodyText, secret) {
			t.Fatalf("response leaked %q in %s", secret, bodyText)
		}
	}
	for _, secret := range []string{"cleanup-secret", "cleanup-error-secret"} {
		if strings.Contains(bodyText, secret) {
			t.Fatalf("response leaked %q in %s", secret, bodyText)
		}
	}
	if !strings.Contains(bodyText, "cleanupError") || !strings.Contains(bodyText, rcloneDiagnosticRedacted) {
		t.Fatalf("response body=%s, want redacted cleanupError", bodyText)
	}
	assertRcloneMovetoTempToFinal(t, captureCalls, upload.ID, "incoming/file.bin")
	assertRcloneDeletefileTempTarget(t, captureCalls, upload.ID, "incoming/file.bin")
	assertNoRcloneFinalKeyDeletefile(t, captureCalls, "incoming/file.bin")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 0)
	assertUploadObjectCount(t, st, profile.ID, upload.ID, 0)
}

func TestUploadDirectHTTPService_FormUploadRedactsRcloneStreamFailure(t *testing.T) {
	installAPIRcloneStdinHook(t, func(_ models.ProfileSecrets, _ []string, _ io.Reader) (string, error) {
		return "failed secret_access_key=stderr-secret https://s3.example/object?X-Amz-Signature=stderr-signature", errors.New("exit status 1 api_token=error-secret")
	})

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("hello")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = withProfileSecrets(req, models.ProfileSecrets{ID: "profile-1", Provider: models.ProfileProviderS3Compatible})
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}

	newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, "profile-1", "upload-1", store.UploadSession{
		Bucket:    "test-bucket",
		ExpiresAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano),
	})

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusInternalServerError)
	}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	bodyText := string(raw)
	for _, secret := range []string{"stderr-secret", "stderr-signature", "error-secret"} {
		if strings.Contains(bodyText, secret) {
			t.Fatalf("response leaked %q in %s", secret, bodyText)
		}
	}
	if !strings.Contains(bodyText, rcloneDiagnosticRedacted) {
		t.Fatalf("response body=%s, want redaction marker", bodyText)
	}
}

func assertRcloneStdinTempTarget(t *testing.T, calls [][]string, uploadID, finalKey string) {
	t.Helper()
	if len(calls) != 1 {
		t.Fatalf("stdin calls=%v, want exactly one rcat", calls)
	}
	args := calls[0]
	if len(args) != 2 || args[0] != "rcat" {
		t.Fatalf("stdin args=%v, want rcat target", args)
	}
	assertTempTarget(t, args[1], uploadID, finalKey)
}

func assertRcloneDeletefileTempTarget(t *testing.T, calls [][]string, uploadID, finalKey string) {
	t.Helper()
	for _, args := range calls {
		if len(args) == 2 && args[0] == "deletefile" {
			assertTempTarget(t, args[1], uploadID, finalKey)
			return
		}
	}
	t.Fatalf("calls=%v, want deletefile for temp target", calls)
}

func assertRcloneMovetoTempToFinal(t *testing.T, calls [][]string, uploadID, finalKey string) {
	t.Helper()
	for _, args := range calls {
		if len(args) == 3 && args[0] == "moveto" {
			assertTempTarget(t, args[1], uploadID, finalKey)
			if args[2] != "remote:test-bucket/"+finalKey {
				t.Fatalf("moveto target=%q, want final key %q", args[2], finalKey)
			}
			return
		}
	}
	t.Fatalf("calls=%v, want moveto temp to final", calls)
}

func assertTempTarget(t *testing.T, target, uploadID, finalKey string) {
	t.Helper()
	if target == "remote:test-bucket/"+finalKey {
		t.Fatalf("target=%q wrote final key directly", target)
	}
	for _, want := range []string{"remote:test-bucket/incoming/.s3desk-upload-temp/" + uploadID + "/", "/" + pathBase(finalKey)} {
		if !strings.Contains(target, want) {
			t.Fatalf("target=%q, want to contain %q", target, want)
		}
	}
}

func pathBase(value string) string {
	idx := strings.LastIndex(value, "/")
	if idx < 0 {
		return value
	}
	return value[idx+1:]
}

func assertNoRcloneCommand(t *testing.T, calls [][]string, command string) {
	t.Helper()
	for _, args := range calls {
		if len(args) > 0 && args[0] == command {
			t.Fatalf("unexpected rclone %s command: %v", command, args)
		}
	}
}

func assertNoRcloneFinalKeyDeletefile(t *testing.T, calls [][]string, finalKey string) {
	t.Helper()
	for _, args := range calls {
		if len(args) == 2 && args[0] == "deletefile" && args[1] == "remote:test-bucket/"+finalKey {
			t.Fatalf("unexpected final-key cleanup command: %v", args)
		}
	}
}

func assertUploadObjectCount(t *testing.T, st *store.Store, profileID, uploadID string, want int) {
	t.Helper()
	objects, err := st.ListUploadObjects(context.Background(), profileID, uploadID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(objects) != want {
		t.Fatalf("len(objects)=%d, want %d", len(objects), want)
	}
}

func TestDirectMultipartStateSerializesCreateForConcurrentChunks(t *testing.T) {
	var (
		mu          sync.Mutex
		createCount int
		secondPost  = make(chan struct{})
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
			select {
			case <-secondPost:
			case <-time.After(100 * time.Millisecond):
			}
		} else if current == 2 {
			close(secondPost)
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

	st, _, _, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	secrets, ok, err := st.GetProfileSecrets(context.Background(), profile.ID)
	if err != nil || !ok {
		t.Fatalf("get profile secrets: ok=%v err=%v", ok, err)
	}
	client, err := s3ClientFromProfile(secrets, false)
	if err != nil {
		t.Fatalf("create s3 client: %v", err)
	}
	apiServer := &server{store: st}

	var wg sync.WaitGroup
	errs := make(chan *uploadHTTPError, 2)
	for _, chunkIndex := range []int{0, 1} {
		chunkIndex := chunkIndex
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, uploadErr := apiServer.directMultipartState(
				httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files", nil),
				client,
				profile.ID,
				upload.ID,
				"file.bin",
				upload,
				"incoming/file.bin",
				chunkIndex,
				2,
				10,
				5,
			)
			errs <- uploadErr
		}()
	}
	wg.Wait()
	close(errs)
	for uploadErr := range errs {
		if uploadErr != nil {
			t.Fatalf("directMultipartState error: %v", uploadErr)
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

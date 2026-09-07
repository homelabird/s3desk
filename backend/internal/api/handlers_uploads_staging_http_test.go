package api

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestUploadStagingHTTPService_HandleStagingChunkUpload_ReturnsInvalidChunkHeader(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))
	rr := httptest.NewRecorder()

	newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, "profile-1", "upload-1", t.TempDir(), 0, "bad")

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

func TestUploadStagingHTTPService_HandleStagingChunkUpload_RejectsTooManyChunks(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files?chunkIndex=0", bytes.NewBufferString("hello"))
	req.Header.Set("X-Upload-Chunk-Total", strconv.Itoa(maxMultipartUploadParts+1))
	req.Header.Set("X-Upload-Relative-Path", "large.bin")
	rr := httptest.NewRecorder()

	newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, "profile-1", "upload-1", t.TempDir(), 0, "0")

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
	if resp.Error.Message != "multipart upload exceeds 10000 parts" {
		t.Fatalf("resp.Error.Message=%q, want multipart upload exceeds 10000 parts", resp.Error.Message)
	}
}

func TestUploadStagingHTTPService_HandleStagingMultipartFormUpload_ReturnsExpectedMultipartError(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("not-multipart"))
	rr := httptest.NewRecorder()

	newUploadStagingHTTPService(srv).handleStagingMultipartFormUpload(rr, req, "profile-1", "upload-1", t.TempDir(), 0)

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

func TestUploadStagingHTTPService_ExecuteChunkRequest_PreservesInvalidChunkHeader(t *testing.T) {
	svc := newUploadStagingHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/files", bytes.NewBufferString("hello"))

	_, _, uploadErr := svc.executeStagingChunkUpload(req, "profile-1", "upload-1", "/tmp/staging", 10, "bad")

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "invalid_request" {
		t.Fatalf("uploadErr.code=%q, want invalid_request", uploadErr.code)
	}
}

func TestUploadStagingHTTPService_FormUploadRemovesFileWhenReservationExceedsLimit(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	stagingDir := t.TempDir()
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, 8); err != nil {
		t.Fatalf("seed upload bytes: %v", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", "file.bin")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("abc")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadStagingHTTPService(srv).handleStagingMultipartFormUpload(rr, req, profile.ID, upload.ID, stagingDir, 0)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusRequestEntityTooLarge)
	}
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 8)
	if _, err := os.Stat(filepath.Join(stagingDir, "file.bin")); !os.IsNotExist(err) {
		t.Fatalf("expected rejected file to be removed, stat err=%v", err)
	}
}

func TestUploadStagingHTTPService_ConcurrentFormsPreserveSameNamedFiles(t *testing.T) {
	for _, tc := range []struct {
		name, secondName, initial string
		maxBytes                  int64
	}{
		{name: "same name", secondName: "file.bin", maxBytes: 11},
		{name: "quota rejection", secondName: "file.bin", maxBytes: 6},
		{name: "suffix collision", secondName: "file-2.bin", initial: "old", maxBytes: 14},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
			profile := createTestProfile(t, st)
			stagingDir := t.TempDir()
			upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano))
			if err != nil {
				t.Fatal(err)
			}
			if tc.initial != "" {
				if err := os.WriteFile(filepath.Join(stagingDir, "file.bin"), []byte(tc.initial), 0o600); err != nil {
					t.Fatal(err)
				}
				if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, int64(len(tc.initial))); err != nil {
					t.Fatal(err)
				}
			}
			srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: tc.maxBytes}, store: st}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			var readers [2]*io.PipeReader
			var writers [2]*io.PipeWriter
			var forms [2]*multipart.Writer
			for i := range readers {
				readers[i], writers[i] = io.Pipe()
				forms[i] = multipart.NewWriter(writers[i])
			}
			closePipes := func() {
				for i := range readers {
					_ = readers[i].CloseWithError(ctx.Err())
					_ = writers[i].CloseWithError(ctx.Err())
				}
			}
			stop := context.AfterFunc(ctx, closePipes)
			var wg sync.WaitGroup
			t.Cleanup(func() { cancel(); closePipes(); wg.Wait(); stop() })
			responses := make(chan *httptest.ResponseRecorder, 2)
			for i := range readers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					req := httptest.NewRequest(http.MethodPost, "/files", readers[i]).WithContext(ctx)
					req.Header.Set("Content-Type", forms[i].FormDataContentType())
					res := httptest.NewRecorder()
					newUploadStagingHTTPService(srv).handleStagingMultipartFormUpload(res, req, profile.ID, upload.ID, stagingDir, int64(len(tc.initial)))
					responses <- res
				}()
			}
			payloads := []string{"first", "second"}
			filenames := []string{"file.bin", tc.secondName}
			var parts [2]io.Writer
			for i := range forms {
				parts[i], err = forms[i].CreateFormFile("files", filenames[i])
				if err != nil {
					t.Fatal(err)
				}
				if _, err := io.WriteString(parts[i], payloads[i][:1]); err != nil {
					t.Fatalf("parallel form body reception: %v", err)
				}
			}
			bodyErrors := make(chan error, 2)
			for i := range forms {
				wg.Add(1)
				go func() {
					defer wg.Done()
					_, err := io.WriteString(parts[i], payloads[i][1:])
					if err == nil {
						err = forms[i].Close()
					}
					_ = writers[i].Close()
					bodyErrors <- err
				}()
			}
			successes := 0
			for range forms {
				if err := <-bodyErrors; err != nil {
					t.Fatal(err)
				}
				res := <-responses
				switch res.Code {
				case http.StatusNoContent:
					successes++
				case http.StatusRequestEntityTooLarge:
					if tc.maxBytes != 6 {
						t.Fatalf("unexpected quota rejection: %s", res.Body.String())
					}
				default:
					t.Fatalf("form status=%d: %s", res.Code, res.Body.String())
				}
			}
			wantFiles := 2
			if tc.maxBytes == 6 {
				wantFiles = 1
			}
			if successes != wantFiles {
				t.Fatalf("successful forms=%d, want %d", successes, wantFiles)
			}
			if tc.initial != "" {
				wantFiles++
				if body, err := os.ReadFile(filepath.Join(stagingDir, "file.bin")); err != nil || string(body) != tc.initial {
					t.Fatalf("original file changed: body=%q err=%v", body, err)
				}
			}
			entries, err := os.ReadDir(stagingDir)
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != wantFiles {
				t.Fatalf("staged files=%d, want %d", len(entries), wantFiles)
			}
			var actualBytes int64
			seen := make(map[string]bool)
			for _, entry := range entries {
				if entry.Name() != "file.bin" && entry.Name() != "file-2.bin" && entry.Name() != "file-3.bin" && entry.Name() != "file-2-2.bin" {
					t.Fatalf("unexpected filename %q", entry.Name())
				}
				body, err := os.ReadFile(filepath.Join(stagingDir, entry.Name()))
				if err != nil {
					t.Fatal(err)
				}
				if (string(body) != "first" && string(body) != "second" && string(body) != tc.initial) || seen[string(body)] {
					t.Fatalf("lost or duplicated form content: %q", body)
				}
				seen[string(body)] = true
				actualBytes += int64(len(body))
			}
			assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, actualBytes)
		})
	}
}

func TestUploadStagingHTTPService_ChunkUploadRemovesTempWhenReservationExceedsLimit(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	stagingDir := t.TempDir()
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, 8); err != nil {
		t.Fatalf("seed upload bytes: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files?chunkIndex=0", bytes.NewBufferString("abc"))
	req.Header.Set("X-Upload-Chunk-Total", "2")
	req.Header.Set("X-Upload-Chunk-Size", "3")
	req.Header.Set("X-Upload-File-Size", "6")
	req.Header.Set("X-Upload-Relative-Path", "chunked/file.bin")
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, profile.ID, upload.ID, stagingDir, 0, "0")

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusRequestEntityTooLarge)
	}
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 8)
	chunkPath := filepath.Join(stagingDir, ".chunks", "chunked", "file.bin", chunkPartName(0))
	if _, err := os.Stat(chunkPath); !os.IsNotExist(err) {
		t.Fatalf("expected rejected chunk file to be absent, stat err=%v", err)
	}
	if _, err := os.Stat(chunkPath + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("expected rejected chunk temp file to be absent, stat err=%v", err)
	}
}

func TestUploadStagingHTTPService_ChunkReplacementRejectsShortBodyWithoutDeletingFinal(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	stagingDir := t.TempDir()
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	relPath := "chunked/file.bin"
	finalPath := filepath.Join(stagingDir, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(finalPath, []byte("old-bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, 9); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files?chunkIndex=0", bytes.NewBufferString("x"))
	req.Header.Set("X-Upload-Chunk-Total", "2")
	req.Header.Set("X-Upload-Chunk-Size", "5")
	req.Header.Set("X-Upload-File-Size", "10")
	req.Header.Set("X-Upload-Relative-Path", relPath)
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, profile.ID, upload.ID, stagingDir, 9, "0")

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" || resp.Error.Message != "chunk size mismatch" {
		t.Fatalf("error=%+v, want invalid_request chunk size mismatch", resp.Error)
	}
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 9)
	chunkPath := filepath.Join(stagingDir, ".chunks", filepath.FromSlash(relPath), chunkPartName(0))
	if _, err := os.Stat(chunkPath); !os.IsNotExist(err) {
		t.Fatalf("expected rejected chunk file to be absent, stat err=%v", err)
	}
	if body, err := os.ReadFile(finalPath); err != nil || string(body) != "old-bytes" {
		t.Fatalf("existing final changed after rejected replacement: body=%q err=%v", body, err)
	}
}

func TestUploadStagingHTTPService_ChunkUploadAcceptsZeroByteFileAtQuota(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	stagingDir := t.TempDir()
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	relPath := "nested/empty.bin"
	if err := os.WriteFile(filepath.Join(stagingDir, "existing.bin"), []byte("0123456789"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, 10); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files?chunkIndex=0", http.NoBody)
	req.Header.Set("X-Upload-Chunk-Total", "1")
	req.Header.Set("X-Upload-Chunk-Size", "5")
	req.Header.Set("X-Upload-File-Size", "0")
	req.Header.Set("X-Upload-Relative-Path", relPath)
	rr := httptest.NewRecorder()
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}

	newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, profile.ID, upload.ID, stagingDir, 10, "0")

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 10)
	info, err := os.Stat(filepath.Join(stagingDir, filepath.FromSlash(relPath)))
	if err != nil {
		t.Fatalf("stat empty staged file: %v", err)
	}
	if !info.Mode().IsRegular() || info.Size() != 0 {
		t.Fatalf("staged file mode=%v size=%d, want regular zero-byte file", info.Mode(), info.Size())
	}
}

func TestUploadStagingHTTPService_ChunkReplacementReleasesExistingFinalBytes(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	stagingDir := t.TempDir()
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	relPath := "chunked/file.bin"
	finalPath := filepath.Join(stagingDir, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o700); err != nil {
		t.Fatalf("mkdir final dir: %v", err)
	}
	if err := os.WriteFile(finalPath, []byte("old-bytes"), 0o600); err != nil {
		t.Fatalf("write existing final: %v", err)
	}
	if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, int64(len("old-bytes"))); err != nil {
		t.Fatalf("seed upload bytes: %v", err)
	}

	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}
	sendChunk := func(index int, payload string) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files?chunkIndex="+strconv.Itoa(index), bytes.NewBufferString(payload))
		req.Header.Set("X-Upload-Chunk-Total", "2")
		req.Header.Set("X-Upload-Chunk-Size", "5")
		req.Header.Set("X-Upload-File-Size", "10")
		req.Header.Set("X-Upload-Relative-Path", relPath)
		rr := httptest.NewRecorder()

		session, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.ID)
		if err != nil {
			t.Fatalf("get upload session before chunk: %v", err)
		}
		if !ok {
			t.Fatal("expected upload session before chunk")
		}
		newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, profile.ID, upload.ID, stagingDir, session.Bytes, strconv.Itoa(index))

		res := rr.Result()
		defer res.Body.Close()
		if res.StatusCode != http.StatusNoContent {
			t.Fatalf("chunk %d status=%d, want %d", index, res.StatusCode, http.StatusNoContent)
		}
	}

	sendChunk(0, "hello")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 5)
	if _, err := os.Stat(finalPath); !os.IsNotExist(err) {
		t.Fatalf("expected existing final removed during replacement, stat err=%v", err)
	}

	sendChunk(1, "world")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 10)
	body, err := os.ReadFile(finalPath)
	if err != nil {
		t.Fatalf("read final: %v", err)
	}
	if string(body) != "helloworld" {
		t.Fatalf("final body=%q, want helloworld", string(body))
	}
}

func TestUploadStagingHTTPService_LateDuplicateChunkDoesNotRemoveAssembledFinal(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	stagingDir := t.TempDir()
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	relPath := "chunked/file.bin"
	srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}
	sendChunk := func(index int, payload string) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/files?chunkIndex="+strconv.Itoa(index), bytes.NewBufferString(payload))
		req.Header.Set("X-Upload-Chunk-Total", "2")
		req.Header.Set("X-Upload-Chunk-Size", "5")
		req.Header.Set("X-Upload-File-Size", "10")
		req.Header.Set("X-Upload-Relative-Path", relPath)
		rr := httptest.NewRecorder()

		session, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.ID)
		if err != nil {
			t.Fatalf("get upload session before chunk: %v", err)
		}
		if !ok {
			t.Fatal("expected upload session before chunk")
		}
		newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, profile.ID, upload.ID, stagingDir, session.Bytes, strconv.Itoa(index))

		res := rr.Result()
		defer res.Body.Close()
		if res.StatusCode != http.StatusNoContent {
			t.Fatalf("chunk %d status=%d, want %d", index, res.StatusCode, http.StatusNoContent)
		}
	}

	sendChunk(0, "hello")
	sendChunk(1, "world")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 10)

	finalPath := filepath.Join(stagingDir, filepath.FromSlash(relPath))
	sendChunk(0, "HELLO")
	assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 10)

	body, err := os.ReadFile(finalPath)
	if err != nil {
		t.Fatalf("read final: %v", err)
	}
	if string(body) != "helloworld" {
		t.Fatalf("final body=%q, want helloworld", string(body))
	}
	chunkPath := filepath.Join(stagingDir, ".chunks", "chunked", "file.bin", chunkPartName(0))
	if _, err := os.Stat(chunkPath); !os.IsNotExist(err) {
		t.Fatalf("expected duplicate chunk not to be restaged, stat err=%v", err)
	}
}

func assertUploadSessionBytesForAPI(t *testing.T, st *store.Store, profileID, uploadID string, want int64) {
	t.Helper()
	session, ok, err := st.GetUploadSession(context.Background(), profileID, uploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatal("expected upload session")
	}
	if session.Bytes != want {
		t.Fatalf("bytes=%d, want %d", session.Bytes, want)
	}
}

func TestUploadStagingHTTPService_RepairsWrongSizedChunkWithinByteLimit(t *testing.T) {
	for _, tc := range []struct {
		name       string
		statusMode string
		tail       string
		retryFirst bool
	}{
		{name: "without status", statusMode: "none", tail: "bad", retryFirst: true},
		{name: "single status", statusMode: "single", tail: "bad", retryFirst: true},
		{name: "batch status", statusMode: "batch", tail: "bad", retryFirst: true},
		{name: "already at quota", statusMode: "none", tail: "world"},
		{name: "replacement restores quota", statusMode: "none", tail: "world!"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
			profile := createTestProfile(t, st)
			expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
			upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "pending", expiresAt)
			if err != nil {
				t.Fatal(err)
			}
			stagingDir := filepath.Join(dataDir, "staging", upload.ID)
			if err := st.SetUploadSessionStagingDir(context.Background(), profile.ID, upload.ID, stagingDir); err != nil {
				t.Fatal(err)
			}
			relPath := "nested/file.bin"
			chunkDir := filepath.Join(stagingDir, ".chunks", filepath.FromSlash(relPath))
			if err := os.MkdirAll(chunkDir, 0o700); err != nil {
				t.Fatal(err)
			}
			for index, body := range []string{"hello", tc.tail} {
				if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(index)), []byte(body), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			initialBytes := int64(5 + len(tc.tail))
			if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, initialBytes); err != nil {
				t.Fatal(err)
			}
			srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}
			if tc.statusMode != "none" {
				req := httptest.NewRequest(http.MethodGet, "/chunks?path="+relPath+"&total=2&chunkSize=5&fileSize=10", nil)
				if tc.statusMode == "batch" {
					req = httptest.NewRequest(http.MethodPost, "/chunks/batch", bytes.NewBufferString(`{"items":[{"path":"nested/file.bin","total":2,"chunkSize":5,"fileSize":10}]}`))
				}
				req.Header.Set("X-Profile-Id", profile.ID)
				req = withUploadIDParam(req, upload.ID)
				rr := httptest.NewRecorder()
				if tc.statusMode == "batch" {
					newUploadMultipartHTTPService(srv).handleGetUploadChunksBatch(rr, req)
				} else {
					newUploadMultipartHTTPService(srv).handleGetUploadChunks(rr, req)
				}
				if rr.Code != http.StatusOK {
					t.Fatalf("chunk status=%d: %s", rr.Code, rr.Body.String())
				}
			}
			for index, body := range []string{"hello", "world"} {
				if index == 0 && !tc.retryFirst {
					continue
				}
				session, _, err := st.GetUploadSession(context.Background(), profile.ID, upload.ID)
				if err != nil {
					t.Fatal(err)
				}
				req := httptest.NewRequest(http.MethodPost, "/files", bytes.NewBufferString(body))
				req.Header.Set("X-Upload-Chunk-Total", "2")
				req.Header.Set("X-Upload-Chunk-Size", "5")
				req.Header.Set("X-Upload-File-Size", "10")
				req.Header.Set("X-Upload-Relative-Path", relPath)
				rr := httptest.NewRecorder()
				newUploadStagingHTTPService(srv).handleStagingChunkUpload(rr, req, profile.ID, upload.ID, stagingDir, session.Bytes, strconv.Itoa(index))
				if rr.Code != http.StatusNoContent {
					t.Fatalf("chunk %d status=%d: %s", index, rr.Code, rr.Body.String())
				}
				if index == 0 {
					if _, err := os.Stat(filepath.Join(stagingDir, filepath.FromSlash(relPath))); !os.IsNotExist(err) {
						t.Fatalf("wrong-sized chunk was assembled before repair: %v", err)
					}
					assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, initialBytes)
				}
			}
			assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 10)
			if body, err := os.ReadFile(filepath.Join(stagingDir, filepath.FromSlash(relPath))); err != nil || string(body) != "helloworld" {
				t.Fatalf("repaired body=%q, err=%v", body, err)
			}
			if pending, err := findPendingStagingArtifact(stagingDir); err != nil || pending != "" {
				t.Fatalf("repaired staging still has pending files: %q err=%v", pending, err)
			}
		})
	}
}

func TestStagingChunkWriteAfterChunkDirectoryRemoval(t *testing.T) {
	for _, completed := range []bool{true, false} {
		t.Run(strconv.FormatBool(completed), func(t *testing.T) {
			st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
			profile := createTestProfile(t, st)
			stagingDir := t.TempDir()
			upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano))
			if err != nil {
				t.Fatal(err)
			}
			values := uploadChunkHeaderValues{relPath: "nested/file.bin", index: 0, total: 2, chunkSize: 5, fileSize: 10}
			relOS, chunkDir, chunkPath, _, uploadErr := stagingChunkUploadPaths(stagingDir, values)
			if uploadErr != nil {
				t.Fatal(uploadErr)
			}
			for i, body := range []string{"hello", "world"} {
				if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(i)), []byte(body), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, 10); err != nil {
				t.Fatal(err)
			}
			// The duplicate request has prepared its path. Another request finishes
			// assembly and removes that directory before the duplicate opens its body file.
			if completed {
				if _, uploadErr := buildStagingMultipartChunkState(context.Background(), stagingDir, values.relPath, values.total, values.chunkSize, values.fileSize); uploadErr != nil {
					t.Fatal(uploadErr)
				}
			} else if err := os.RemoveAll(chunkDir); err != nil {
				t.Fatal(err)
			}
			body := bytes.NewBufferString("hello")
			req := httptest.NewRequest(http.MethodPost, "/files", body)
			srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}
			remaining := int64(0)
			uploadErr = srv.stagingChunkWrite(req, profile.ID, upload.ID, stagingDir, relOS, values, chunkPath, 5, &remaining, 10)
			if completed {
				if uploadErr != nil {
					t.Fatalf("completed duplicate failed: %+v", uploadErr)
				}
				if body, err := os.ReadFile(filepath.Join(stagingDir, relOS)); err != nil || string(body) != "helloworld" {
					t.Fatalf("completed file changed: body=%q err=%v", body, err)
				}
			} else if uploadErr == nil || uploadErr.status != http.StatusInternalServerError {
				t.Fatalf("missing incomplete upload must remain an error: %+v", uploadErr)
			}
			if body.Len() != 5 {
				t.Fatal("request body was consumed after directory removal")
			}
			assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 10)
			if pending, err := findPendingStagingArtifact(stagingDir); err != nil || pending != "" {
				t.Fatalf("unexpected pending file %q: %v", pending, err)
			}
		})
	}
}

func TestUploadStagingHTTPService_OverlappingChunkRetriesCountBytesOnce(t *testing.T) {
	for _, tc := range []struct {
		name         string
		index        int
		initial      string
		initialFinal bool
	}{
		{name: "pending chunk"},
		{name: "final chunk", index: 1, initial: "hello"},
		{name: "replacement", initial: "old-bytes", initialFinal: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
			profile := createTestProfile(t, st)
			stagingDir := t.TempDir()
			upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, stagingDir, time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano))
			if err != nil {
				t.Fatal(err)
			}
			relPath := "nested/file.bin"
			finalPath := filepath.Join(stagingDir, filepath.FromSlash(relPath))
			chunkDir := filepath.Join(stagingDir, ".chunks", filepath.FromSlash(relPath))
			if tc.initial != "" {
				seedPath := filepath.Join(chunkDir, chunkPartName(0))
				if tc.initialFinal {
					seedPath = finalPath
				}
				if err := os.MkdirAll(filepath.Dir(seedPath), 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(seedPath, []byte(tc.initial), 0o600); err != nil {
					t.Fatal(err)
				}
				if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, int64(len(tc.initial))); err != nil {
					t.Fatal(err)
				}
			}
			srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			request := func(body io.Reader) *http.Request {
				req := httptest.NewRequest(http.MethodPost, "/files", body).WithContext(ctx)
				req.Header.Set("X-Upload-Chunk-Total", "2")
				req.Header.Set("X-Upload-Chunk-Size", "5")
				req.Header.Set("X-Upload-File-Size", "10")
				req.Header.Set("X-Upload-Relative-Path", relPath)
				return req
			}
			var readers [2]*io.PipeReader
			var writers [2]*io.PipeWriter
			for i := range readers {
				readers[i], writers[i] = io.Pipe()
			}
			closePipes := func() {
				for i := range readers {
					_ = readers[i].CloseWithError(ctx.Err())
					_ = writers[i].CloseWithError(ctx.Err())
				}
			}
			stop := context.AfterFunc(ctx, closePipes)
			var wg sync.WaitGroup
			t.Cleanup(func() { cancel(); closePipes(); wg.Wait(); stop() })
			responses := make(chan *httptest.ResponseRecorder, 2)
			for _, reader := range readers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					res := httptest.NewRecorder()
					newUploadStagingHTTPService(srv).handleStagingChunkUpload(res, request(reader), profile.ID, upload.ID, stagingDir, int64(len(tc.initial)), strconv.Itoa(tc.index))
					responses <- res
				}()
			}
			payload := "hello"
			if tc.index == 1 {
				payload = "world"
			}
			// Both requests must consume a body prefix before either can finish.
			// This also prevents a fix from serializing network body reception.
			for _, writer := range writers {
				if _, err := io.WriteString(writer, payload[:1]); err != nil {
					t.Fatalf("parallel body reception: %v", err)
				}
			}
			bodyErrors := make(chan error, 2)
			for _, writer := range writers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					_, err := io.WriteString(writer, payload[1:])
					_ = writer.Close()
					bodyErrors <- err
				}()
			}
			for range writers {
				if err := <-bodyErrors; err != nil {
					t.Fatalf("finish body: %v", err)
				}
				res := <-responses
				if res.Code != http.StatusNoContent {
					t.Fatalf("overlapping retry status=%d: %s", res.Code, res.Body.String())
				}
			}
			if tc.index == 0 {
				assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 5)
				res := httptest.NewRecorder()
				newUploadStagingHTTPService(srv).handleStagingChunkUpload(res, request(bytes.NewBufferString("world")), profile.ID, upload.ID, stagingDir, 5, "1")
				if res.Code != http.StatusNoContent {
					t.Fatalf("final chunk status=%d: %s", res.Code, res.Body.String())
				}
			}
			assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, 10)
			if body, err := os.ReadFile(finalPath); err != nil || string(body) != "helloworld" {
				t.Fatalf("assembled body=%q, err=%v", body, err)
			}
			if pending, err := findPendingStagingArtifact(stagingDir); err != nil || pending != "" {
				t.Fatalf("commit blocked by %q: %v", pending, err)
			}
		})
	}
}

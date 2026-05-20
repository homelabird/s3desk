package api

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
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

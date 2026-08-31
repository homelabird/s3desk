package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestUploadMultipartHTTPService_HandleCompleteMultipartUpload_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/multipart/complete", bytes.NewBufferString(`{"path":"file.bin"}`))
	rr := httptest.NewRecorder()

	newUploadMultipartHTTPService(srv).handleCompleteMultipartUpload(rr, req)

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

func TestUploadMultipartHTTPService_HandleAbortMultipartUpload_ReturnsInvalidJSON(t *testing.T) {
	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	srv := &server{cfg: config.Config{DataDir: dataDir}, store: st}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/"+upload.ID+"/multipart/abort", bytes.NewBufferString(`{"path":"file.bin"}{`))
	req.Header.Set("X-Profile-Id", profile.ID)
	req.Header.Set("Content-Type", "application/json")
	req = withUploadIDParam(req, upload.ID)
	rr := httptest.NewRecorder()

	newUploadMultipartHTTPService(srv).handleAbortMultipartUpload(rr, req)

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

func TestUploadMultipartHTTPService_HandleGetUploadChunks_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/missing/chunks?path=file.bin&chunkSize=5&fileSize=5", nil)
	rr := httptest.NewRecorder()

	newUploadMultipartHTTPService(srv).handleGetUploadChunks(rr, req)

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

func TestUploadChunkStatusBatchReturnsStagingAndDirectMultipartState(t *testing.T) {
	t.Run("staging", func(t *testing.T) {
		st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
		profile := createTestProfile(t, st)
		upload := createUploadSessionForMode(t, srv, profile.ID, uploadModeStaging)
		session, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
		if err != nil || !ok {
			t.Fatalf("get upload session: ok=%v err=%v", ok, err)
		}

		for path, index := range map[string]int{"first.bin": 0, "folder/second.bin": 1} {
			chunkDir := filepath.Join(session.StagingDir, ".chunks", filepath.FromSlash(path))
			if err := os.MkdirAll(chunkDir, 0o700); err != nil {
				t.Fatalf("mkdir chunk dir: %v", err)
			}
			if err := os.WriteFile(filepath.Join(chunkDir, chunkPartName(index)), []byte("12345"), 0o600); err != nil {
				t.Fatalf("write chunk: %v", err)
			}
		}

		res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/chunks/batch", profile.ID, models.UploadChunkStatusBatchRequest{Items: []models.UploadChunkStatusRequest{
			{Path: "first.bin", Total: 2, ChunkSize: 5, FileSize: 10},
			{Path: "folder/second.bin", Total: 2, ChunkSize: 5, FileSize: 10},
		}})
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(res.Body)
			t.Fatalf("status=%d, want 200: %s", res.StatusCode, body)
		}
		var state models.UploadChunkStatusBatchResponse
		decodeJSONResponse(t, res, &state)
		if len(state.Items) != 2 || len(state.Items[0].Present) != 1 || state.Items[0].Present[0] != 0 || len(state.Items[1].Present) != 1 || state.Items[1].Present[0] != 1 {
			t.Fatalf("unexpected staging batch state: %+v", state.Items)
		}
	})

	t.Run("direct multipart", func(t *testing.T) {
		fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{listBody: fakeListPartsXML()})
		st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
		profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
		upload := createUploadSessionForMode(t, srv, profile.ID, uploadModeDirect)
		seedMultipartUploadMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "first.bin", "upload-1", 5, 10)
		seedMultipartUploadMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "folder/second.bin", "upload-2", 5, 10)

		res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/chunks/batch", profile.ID, models.UploadChunkStatusBatchRequest{Items: []models.UploadChunkStatusRequest{
			{Path: "first.bin", Total: 2, ChunkSize: 5, FileSize: 10},
			{Path: "folder/second.bin", Total: 2, ChunkSize: 5, FileSize: 10},
		}})
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(res.Body)
			t.Fatalf("status=%d, want 200: %s", res.StatusCode, body)
		}
		var state models.UploadChunkStatusBatchResponse
		decodeJSONResponse(t, res, &state)
		if len(state.Items) != 2 {
			t.Fatalf("direct multipart items=%d, want 2", len(state.Items))
		}
		for _, item := range state.Items {
			if len(item.Present) != 2 || item.Present[0] != 0 || item.Present[1] != 1 {
				t.Fatalf("unexpected direct multipart state for %q: %v", item.Path, item.Present)
			}
		}
	})
}

func TestUploadChunkStatusBatchRejectsMoreThanBound(t *testing.T) {
	items := make([]models.UploadChunkStatusRequest, uploadChunkStatusBatchMaxItems+1)
	for i := range items {
		items[i] = models.UploadChunkStatusRequest{Path: "file.bin", Total: 1, ChunkSize: 1, FileSize: 1}
	}
	body, err := json.Marshal(models.UploadChunkStatusBatchRequest{Items: items})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := withUploadIDParam(httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/chunks/batch", bytes.NewReader(body)), "upload-1")
	req.Header.Set("X-Profile-Id", "profile-1")
	rr := httptest.NewRecorder()

	newUploadMultipartHTTPService(&server{}).handleGetUploadChunksBatch(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", res.StatusCode)
	}
	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" || resp.Error.Details["maxItems"] != float64(uploadChunkStatusBatchMaxItems) {
		t.Fatalf("unexpected response: %+v", resp.Error)
	}
}

func TestUploadChunkStatusBatchRejectsAggregatePartLimit(t *testing.T) {
	body, err := json.Marshal(models.UploadChunkStatusBatchRequest{Items: []models.UploadChunkStatusRequest{
		{Path: "first.bin", Total: maxMultipartUploadParts, ChunkSize: 1, FileSize: maxMultipartUploadParts},
		{Path: "second.bin", Total: 1, ChunkSize: 1, FileSize: 1},
	}})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := withUploadIDParam(httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/chunks/batch", bytes.NewReader(body)), "upload-1")
	req.Header.Set("X-Profile-Id", "profile-1")
	rr := httptest.NewRecorder()

	newUploadMultipartHTTPService(&server{}).handleGetUploadChunksBatch(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", res.StatusCode)
	}
	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" || resp.Error.Message != "multipart upload exceeds 10000 parts" {
		t.Fatalf("unexpected response: %+v", resp.Error)
	}
}

func TestUploadChunkStatusBatchRejectsAggregateLimitBypass(t *testing.T) {
	body, err := json.Marshal(models.UploadChunkStatusBatchRequest{Items: []models.UploadChunkStatusRequest{
		{Path: "first.bin", Total: 1, ChunkSize: 1, FileSize: 6000},
		{Path: "second.bin", Total: 1, ChunkSize: 1, FileSize: 6000},
	}})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := withUploadIDParam(httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/chunks/batch", bytes.NewReader(body)), "upload-1")
	req.Header.Set("X-Profile-Id", "profile-1")
	rr := httptest.NewRecorder()

	newUploadMultipartHTTPService(&server{}).handleGetUploadChunksBatch(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", res.StatusCode)
	}
	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "invalid_request" || resp.Error.Message != "chunk total mismatch" {
		t.Fatalf("unexpected response: %+v", resp.Error)
	}
}

func TestExecuteCompleteRequest_PreservesMissingProfileAndUploadID(t *testing.T) {
	svc := newUploadMultipartHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/multipart/complete", bytes.NewBufferString(`{"path":"file.bin"}`))

	_, uploadErr, _ := svc.executeCompleteMultipartUpload(req)

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

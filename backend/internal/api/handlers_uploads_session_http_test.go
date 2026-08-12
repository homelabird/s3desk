package api

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestUploadSessionHTTPService_HandleCreateUploadSession_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket"}`))
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleCreateUploadSession(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
	if resp.Error.Message != "X-Profile-Id header is required" {
		t.Fatalf("resp.Error.Message=%q, want X-Profile-Id header is required", resp.Error.Message)
	}
}

func TestUploadSessionHTTPService_HandleCreateUploadSession_ReturnsInvalidJSON(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket"}{`))
	req.Header.Set("X-Profile-Id", "profile-1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleCreateUploadSession(rr, req)

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

func TestUploadSessionHTTPService_HandleCreateUploadSession_ReturnsInvalidMode(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket","mode":"turbo"}`))
	req.Header.Set("X-Profile-Id", "profile-1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleCreateUploadSession(rr, req)

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
	if got := resp.Error.Details["mode"]; got != "turbo" {
		t.Fatalf("details.mode=%v, want turbo", got)
	}
}

func TestUploadSessionHTTPService_HandleCreateUploadSession_ReturnsInvalidPrefixSegment(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket","prefix":"incoming/../escape"}`))
	req.Header.Set("X-Profile-Id", "profile-1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleCreateUploadSession(rr, req)

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
	if resp.Error.Message != "prefix contains invalid path segment" {
		t.Fatalf("resp.Error.Message=%q, want prefix contains invalid path segment", resp.Error.Message)
	}
}

func TestUploadSessionHTTPService_CreateStagingRollsBackSessionWhenDirectorySetupFails(t *testing.T) {
	st, _, _, dataDir := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, false)
	profile := createTestProfile(t, st)
	blockedDataDir := filepath.Join(dataDir, "data-dir-file")
	if err := os.WriteFile(blockedDataDir, []byte("not a directory"), 0o600); err != nil {
		t.Fatalf("write blocked data dir: %v", err)
	}

	svc := newUploadSessionHTTPService(&server{
		cfg:   config.Config{DataDir: blockedDataDir},
		store: st,
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", nil)
	_, uploadErr, decodeErr := svc.executePreparedCreate(request, uploadSessionCreatePreparedRequest{
		profileID: profile.ID,
		req: models.UploadCreateRequest{
			Bucket: "test-bucket",
			Prefix: "incoming",
		},
		mode: uploadModeStaging,
	})
	if decodeErr != nil {
		t.Fatalf("decodeErr=%v, want nil", decodeErr)
	}
	if uploadErr == nil || uploadErr.code != "internal_error" {
		t.Fatalf("uploadErr=%+v, want internal_error", uploadErr)
	}

	sessions, err := st.ListUploadSessionsByProfile(context.Background(), profile.ID, 100)
	if err != nil {
		t.Fatalf("list upload sessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("sessions=%d, want rollback to remove created session", len(sessions))
	}
}

func TestUploadSessionHTTPService_HandleDeleteUploadSession_ReturnsMissingProfileAndUploadID(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/uploads", nil)
	rr := httptest.NewRecorder()

	newUploadSessionHTTPService(srv).handleDeleteUploadSession(rr, req)

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

func TestUploadSessionHTTPService_DeleteDirectUploadSessionCleansTempPrefix(t *testing.T) {
	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, "http://localhost:9000")

	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	var rcloneCalls [][]string
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		rcloneCalls = append(rcloneCalls, append([]string(nil), args...))
		return "", "", nil
	})

	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/uploads/"+session.ID, profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}

	if len(rcloneCalls) != 1 {
		t.Fatalf("rcloneCalls=%v, want one temp cleanup call", rcloneCalls)
	}
	wantTarget := "remote:test-bucket/incoming/.s3desk-upload-temp/" + session.ID + "/"
	if args := rcloneCalls[0]; len(args) != 2 || args[0] != "delete" || args[1] != wantTarget {
		t.Fatalf("rclone args=%v, want [delete %s]", args, wantTarget)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if ok {
		t.Fatalf("expected upload session to be deleted")
	}
}

func TestUploadSessionHTTPService_DeleteDirectUploadSessionKeepsSessionWhenTempCleanupFails(t *testing.T) {
	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, "http://localhost:9000")

	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	installAPIRcloneCaptureHook(t, func(_ []string) (string, string, error) {
		return "", "delete failed", errors.New("exit status 1")
	})

	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/uploads/"+session.ID, profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusInternalServerError)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if !ok {
		t.Fatalf("expected upload session to remain for retry")
	}
}

func TestUploadSessionHTTPService_DeleteMultipartKeepsMetadataWhenProviderAbortFails(t *testing.T) {
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`<Error><Code>AccessDenied</Code><Message>abort denied</Message></Error>`))
	}))
	t.Cleanup(fakeS3.Close)

	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	seedMultipartUploadMetadata(t, st, profile.ID, session.ID, "test-bucket", "incoming", "file.bin", "multipart-id", 5, 10)

	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/uploads/"+session.ID, profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusInternalServerError)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil || !ok {
		t.Fatalf("upload session exists=%v err=%v, want retained", ok, err)
	}
	uploads, err := st.ListMultipartUploads(context.Background(), profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list multipart uploads: %v", err)
	}
	if len(uploads) != 1 {
		t.Fatalf("multipart uploads=%d, want 1", len(uploads))
	}
}

func TestUploadSessionHTTPService_DeleteMultipartTreatsMissingUploadAsClean(t *testing.T) {
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`<Error><Code>NoSuchUpload</Code><Message>upload is already gone</Message></Error>`))
	}))
	t.Cleanup(fakeS3.Close)

	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModePresigned, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	seedMultipartUploadMetadata(t, st, profile.ID, session.ID, "test-bucket", "incoming", "file.bin", "gone", 5, 10)

	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/uploads/"+session.ID, profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil || ok {
		t.Fatalf("upload session exists=%v err=%v, want deleted", ok, err)
	}
}

func TestUploadSessionHTTPService_DeleteStagingAbortsStaleMultipart(t *testing.T) {
	var abortedUploadID string
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		abortedUploadID = r.URL.Query().Get("uploadId")
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(fakeS3.Close)

	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	seedMultipartUploadMetadata(t, st, profile.ID, session.ID, "test-bucket", "incoming", "file.bin", "stale-multipart-id", 5, 10)

	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/uploads/"+session.ID, profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if abortedUploadID != "stale-multipart-id" {
		t.Fatalf("aborted uploadId=%q, want stale-multipart-id", abortedUploadID)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil || ok {
		t.Fatalf("upload session exists=%v err=%v, want deleted", ok, err)
	}
}

func TestUploadSessionHTTPService_DeletePreservesSessionWhenStoreCleanupFails(t *testing.T) {
	st, _, _, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfile(t, st)
	session, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "", time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/uploads/"+session.ID, nil).WithContext(ctx)
	uploadErr := newUploadSessionHTTPService(&server{store: st}).executePreparedDelete(req, uploadSessionDeletePreparedRequest{
		profileID: profile.ID,
		uploadID:  session.ID,
		us:        session,
		mode:      uploadModeStaging,
	})

	if uploadErr == nil {
		t.Fatal("expected store cleanup error")
	}
	if uploadErr.code != "internal_error" {
		t.Fatalf("uploadErr.code=%q, want internal_error", uploadErr.code)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil {
		t.Fatalf("get upload session: %v", err)
	} else if !ok {
		t.Fatal("expected upload session to remain for retry")
	}
}

func TestExecuteCreate_PreservesMissingProfile(t *testing.T) {
	svc := newUploadSessionHTTPService(&server{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewBufferString(`{"bucket":"test-bucket"}`))

	_, uploadErr, _ := svc.executeCreate(req)

	if uploadErr == nil {
		t.Fatal("expected upload error")
	}
	if uploadErr.code != "missing_profile" {
		t.Fatalf("uploadErr.code=%q, want missing_profile", uploadErr.code)
	}
}

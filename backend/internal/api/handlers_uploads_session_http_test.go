package api

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
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

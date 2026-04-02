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
	"strconv"
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

func TestCommitUploadPresignedRejectsMissingRemoteObject(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	upload := createUploadSessionForMode(t, srv, profile.ID, "presigned")
	size := int64(5)

	presignRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/presign", profile.ID, models.UploadPresignRequest{
		Path: "file.bin",
		Size: &size,
	})
	defer presignRes.Body.Close()
	if presignRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(presignRes.Body)
		t.Fatalf("expected status 200, got %d: %s", presignRes.StatusCode, string(body))
	}

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
	if !strings.Contains(errResp.Error.Message, "object not found") {
		t.Fatalf("expected missing object message, got %q", errResp.Error.Message)
	}

	jobIDs, err := st.ListJobIDsByProfile(context.Background(), profile.ID)
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if len(jobIDs) != 0 {
		t.Fatalf("expected no jobs after failed commit, got %d", len(jobIDs))
	}

	_, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatalf("expected upload session to remain after failed verification")
	}
}

func TestCommitUploadPresignedUsesVerifiedObjectMetadata(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{
		headByObject: map[string]objectHeadBehavior{
			"test-bucket/incoming/file.bin": {
				Size:         5,
				ETag:         `"etag-verified"`,
				LastModified: "2026-03-05T00:00:02Z",
			},
		},
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	upload := createUploadSessionForMode(t, srv, profile.ID, "presigned")
	size := int64(5)

	presignRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/presign", profile.ID, models.UploadPresignRequest{
		Path: "file.bin",
		Size: &size,
	})
	defer presignRes.Body.Close()
	if presignRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(presignRes.Body)
		t.Fatalf("expected status 200, got %d: %s", presignRes.StatusCode, string(body))
	}

	claimedSize := int64(999)
	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, map[string]any{
		"totalFiles": 1,
		"totalBytes": claimedSize,
		"items": []map[string]any{
			{"path": "ghost.bin", "size": claimedSize},
		},
	})
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 201, got %d: %s", commitRes.StatusCode, string(body))
	}

	var created models.JobCreatedResponse
	decodeJSONResponse(t, commitRes, &created)
	job := requireStoredJob(t, st, profile.ID, created.JobID)
	if job.Type != jobs.JobTypeTransferDirectUpload {
		t.Fatalf("expected job type %q, got %q", jobs.JobTypeTransferDirectUpload, job.Type)
	}
	requireImmediateUploadPayload(t, job, "file.bin", "incoming/file.bin", 5, 1)

	indexed, err := st.SearchObjectIndex(context.Background(), profile.ID, store.SearchObjectIndexInput{
		Bucket: "test-bucket",
		Query:  "file.bin",
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("search object index: %v", err)
	}
	if len(indexed.Items) != 1 {
		t.Fatalf("expected 1 indexed object, got %d", len(indexed.Items))
	}
	if indexed.Items[0].Key != "incoming/file.bin" || indexed.Items[0].Size != 5 {
		t.Fatalf("unexpected indexed object: %+v", indexed.Items[0])
	}

	_, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if ok {
		t.Fatalf("expected upload session to be deleted after verified commit")
	}
}

func TestCommitUploadDirectUsesVerifiedObjectMetadata(t *testing.T) {
	fakeS3 := newMultipartS3TestServer(t, multipartS3Behavior{
		headByObject: map[string]objectHeadBehavior{
			"test-bucket/incoming/file.bin": {
				Size:         7,
				ETag:         `"etag-direct"`,
				LastModified: "2026-03-05T00:00:03Z",
			},
		},
	})

	st, _, srv, _ := newTestJobsServerWithUploadDirect(t, testEncryptionKey(), false, true)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	upload := createUploadSessionForMode(t, srv, profile.ID, "direct")
	expectedSize := int64(7)
	seedUploadObjectMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "file.bin", &expectedSize)

	claimedSize := int64(999)
	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, map[string]any{
		"totalFiles": 1,
		"totalBytes": claimedSize,
		"items": []map[string]any{
			{"path": "ghost.bin", "size": claimedSize},
		},
	})
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 201, got %d: %s", commitRes.StatusCode, string(body))
	}

	var created models.JobCreatedResponse
	decodeJSONResponse(t, commitRes, &created)
	job := requireStoredJob(t, st, profile.ID, created.JobID)
	if job.Type != jobs.JobTypeTransferDirectUpload {
		t.Fatalf("expected job type %q, got %q", jobs.JobTypeTransferDirectUpload, job.Type)
	}
	requireImmediateUploadPayload(t, job, "file.bin", "incoming/file.bin", 7, 1)

	indexed, err := st.SearchObjectIndex(context.Background(), profile.ID, store.SearchObjectIndexInput{
		Bucket: "test-bucket",
		Query:  "file.bin",
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("search object index: %v", err)
	}
	if len(indexed.Items) != 1 {
		t.Fatalf("expected 1 indexed object, got %d", len(indexed.Items))
	}
	if indexed.Items[0].Key != "incoming/file.bin" || indexed.Items[0].Size != 7 {
		t.Fatalf("unexpected indexed object: %+v", indexed.Items[0])
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

func TestCompleteMultipartUploadPreconditions(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	validBody := `{"path":"file.bin","parts":[{"number":1,"etag":"etag-1"},{"number":2,"etag":"etag-2"}]}`
	cases := []struct {
		name             string
		mode             string
		useMissingUpload bool
		omitProfile      bool
		seedMetadata     bool
		body             string
		wantCode         int
		wantErrorCode    string
		wantBodyContains string
		wantMaxBytes     bool
	}{
		{
			name:             "rejects missing profile header",
			mode:             "presigned",
			body:             validBody,
			wantCode:         http.StatusBadRequest,
			wantErrorCode:    "missing_profile",
			wantBodyContains: "X-Profile-Id header is required",
			omitProfile:      true,
		},
		{
			name:             "rejects missing upload session",
			useMissingUpload: true,
			body:             validBody,
			wantCode:         http.StatusNotFound,
			wantErrorCode:    "not_found",
			wantBodyContains: "upload session not found",
		},
		{
			name:             "rejects non presigned mode",
			mode:             "staging",
			body:             validBody,
			wantCode:         http.StatusBadRequest,
			wantErrorCode:    "not_supported",
			wantBodyContains: "presigned upload session",
		},
		{
			name:          "rejects trailing json",
			mode:          "presigned",
			seedMetadata:  true,
			body:          validBody + `{"extra":true}`,
			wantCode:      http.StatusBadRequest,
			wantErrorCode: "invalid_json",
		},
		{
			name:             "rejects invalid path",
			mode:             "presigned",
			body:             `{"path":"../","parts":[{"number":1,"etag":"etag-1"}]}`,
			wantCode:         http.StatusBadRequest,
			wantErrorCode:    "invalid_request",
			wantBodyContains: "path is required",
		},
		{
			name:             "rejects missing parts",
			mode:             "presigned",
			body:             `{"path":"file.bin","parts":[]}`,
			wantCode:         http.StatusBadRequest,
			wantErrorCode:    "invalid_request",
			wantBodyContains: "parts are required",
		},
		{
			name:             "rejects missing multipart metadata",
			mode:             "presigned",
			body:             validBody,
			wantCode:         http.StatusNotFound,
			wantErrorCode:    "not_found",
			wantBodyContains: "multipart upload not found",
		},
		{
			name:          "rejects oversized json body",
			mode:          "presigned",
			body:          `{"path":"` + strings.Repeat("a", int(uploadMultipartJSONRequestBodyMaxBytes)) + `","parts":[{"number":1,"etag":"etag-1"}]}`,
			wantCode:      http.StatusRequestEntityTooLarge,
			wantErrorCode: "too_large",
			wantMaxBytes:  true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uploadID := "missing-upload"
			if !tc.useMissingUpload {
				upload := createUploadSessionForMode(t, srv, profile.ID, tc.mode)
				uploadID = upload.UploadID
				if tc.seedMetadata {
					seedMultipartUploadMetadata(t, st, profile.ID, upload.UploadID, "test-bucket", "incoming", "file.bin", "upload-1", 5, 10)
				}
			}

			var res *http.Response
			if tc.omitProfile {
				req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/uploads/"+uploadID+"/multipart/complete", strings.NewReader(tc.body))
				if err != nil {
					t.Fatalf("new request: %v", err)
				}
				req.Header.Set("Content-Type", "application/json")
				res, err = http.DefaultClient.Do(req)
				if err != nil {
					t.Fatalf("do request: %v", err)
				}
			} else {
				res = doRawJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+uploadID+"/multipart/complete", profile.ID, tc.body)
			}
			defer res.Body.Close()
			if res.StatusCode != tc.wantCode {
				raw, _ := io.ReadAll(res.Body)
				t.Fatalf("expected status %d, got %d: %s", tc.wantCode, res.StatusCode, string(raw))
			}

			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != tc.wantErrorCode {
				t.Fatalf("error.code=%q, want %q", errResp.Error.Code, tc.wantErrorCode)
			}
			if tc.wantBodyContains != "" && !strings.Contains(errResp.Error.Message, tc.wantBodyContains) {
				t.Fatalf("error.message=%q, want to contain %q", errResp.Error.Message, tc.wantBodyContains)
			}
			if tc.wantMaxBytes {
				if got := errResp.Error.Details["maxBytes"]; got != float64(uploadMultipartJSONRequestBodyMaxBytes) {
					t.Fatalf("details.maxBytes=%v, want %d", got, uploadMultipartJSONRequestBodyMaxBytes)
				}
			}
		})
	}
}

func TestAbortMultipartUploadPreconditions(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	cases := []struct {
		name             string
		mode             string
		useMissingUpload bool
		body             string
		wantCode         int
		wantErrorCode    string
		wantBodyContains string
		wantMaxBytes     bool
	}{
		{
			name:             "rejects missing upload session",
			useMissingUpload: true,
			body:             `{"path":"file.bin"}`,
			wantCode:         http.StatusNotFound,
			wantErrorCode:    "not_found",
			wantBodyContains: "upload session not found",
		},
		{
			name:             "rejects non presigned mode",
			mode:             "staging",
			body:             `{"path":"file.bin"}`,
			wantCode:         http.StatusBadRequest,
			wantErrorCode:    "not_supported",
			wantBodyContains: "presigned upload session",
		},
		{
			name:             "rejects invalid path",
			mode:             "presigned",
			body:             `{"path":"../"}`,
			wantCode:         http.StatusBadRequest,
			wantErrorCode:    "invalid_request",
			wantBodyContains: "path is required",
		},
		{
			name:             "rejects missing multipart metadata",
			mode:             "presigned",
			body:             `{"path":"file.bin"}`,
			wantCode:         http.StatusNotFound,
			wantErrorCode:    "not_found",
			wantBodyContains: "multipart upload not found",
		},
		{
			name:          "rejects oversized json body",
			mode:          "presigned",
			body:          `{"path":"` + strings.Repeat("a", int(uploadMultipartJSONRequestBodyMaxBytes)) + `"}`,
			wantCode:      http.StatusRequestEntityTooLarge,
			wantErrorCode: "too_large",
			wantMaxBytes:  true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uploadID := "missing-upload"
			if !tc.useMissingUpload {
				upload := createUploadSessionForMode(t, srv, profile.ID, tc.mode)
				uploadID = upload.UploadID
			}

			res := doRawJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+uploadID+"/multipart/abort", profile.ID, tc.body)
			defer res.Body.Close()
			if res.StatusCode != tc.wantCode {
				raw, _ := io.ReadAll(res.Body)
				t.Fatalf("expected status %d, got %d: %s", tc.wantCode, res.StatusCode, string(raw))
			}

			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != tc.wantErrorCode {
				t.Fatalf("error.code=%q, want %q", errResp.Error.Code, tc.wantErrorCode)
			}
			if tc.wantBodyContains != "" && !strings.Contains(errResp.Error.Message, tc.wantBodyContains) {
				t.Fatalf("error.message=%q, want to contain %q", errResp.Error.Message, tc.wantBodyContains)
			}
			if tc.wantMaxBytes {
				if got := errResp.Error.Details["maxBytes"]; got != float64(uploadMultipartJSONRequestBodyMaxBytes) {
					t.Fatalf("details.maxBytes=%v, want %d", got, uploadMultipartJSONRequestBodyMaxBytes)
				}
			}
		})
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
	headByObject   map[string]objectHeadBehavior
}

type objectHeadBehavior struct {
	Status       int
	Size         int64
	ETag         string
	LastModified string
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
		case http.MethodHead:
			head, ok := lookupMultipartObjectHead(r, behavior.headByObject)
			status := http.StatusNotFound
			if ok {
				status = head.Status
				if status == 0 {
					status = http.StatusOK
				}
			}
			if head.Size > 0 {
				w.Header().Set("Content-Length", strconv.FormatInt(head.Size, 10))
			}
			if head.ETag != "" {
				w.Header().Set("ETag", head.ETag)
			}
			if head.LastModified != "" {
				lastModified := head.LastModified
				if parsed, err := time.Parse(time.RFC3339Nano, head.LastModified); err == nil {
					lastModified = parsed.UTC().Format(http.TimeFormat)
				}
				w.Header().Set("Last-Modified", lastModified)
			}
			w.WriteHeader(status)
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

func lookupMultipartObjectHead(r *http.Request, heads map[string]objectHeadBehavior) (objectHeadBehavior, bool) {
	for _, candidate := range multipartObjectIDs(r) {
		head, ok := heads[candidate]
		if ok {
			return head, true
		}
	}
	return objectHeadBehavior{}, false
}

func multipartObjectIDs(r *http.Request) []string {
	trimmed := strings.TrimPrefix(r.URL.Path, "/")
	if trimmed == "" {
		return nil
	}
	candidates := []string{trimmed}
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 {
		return candidates
	}
	candidates = append(candidates, parts[1], parts[0]+"/"+parts[1])
	return candidates
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

func seedUploadObjectMetadata(
	t *testing.T,
	st *store.Store,
	profileID, uploadID, bucket, prefix, relPath string,
	expectedSize *int64,
) {
	t.Helper()

	objectKey := relPath
	if prefix != "" {
		objectKey = path.Join(prefix, relPath)
	}
	if err := st.UpsertUploadObject(context.Background(), store.UploadObject{
		UploadID:     uploadID,
		ProfileID:    profileID,
		Path:         relPath,
		Bucket:       bucket,
		ObjectKey:    objectKey,
		ExpectedSize: expectedSize,
	}); err != nil {
		t.Fatalf("upsert upload object: %v", err)
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

func requireStoredJob(t *testing.T, st *store.Store, profileID, jobID string) models.Job {
	t.Helper()

	job, ok, err := st.GetJob(context.Background(), profileID, jobID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok {
		t.Fatalf("expected job %q", jobID)
	}
	if job.Status != models.JobStatusSucceeded {
		t.Fatalf("expected succeeded job, got %s", job.Status)
	}
	return job
}

func requireImmediateUploadPayload(t *testing.T, job models.Job, wantPath, wantKey string, wantSize int64, wantFiles int) {
	t.Helper()

	if got := job.Payload["totalFiles"]; got != float64(wantFiles) {
		t.Fatalf("payload.totalFiles=%v, want %d", got, wantFiles)
	}
	if got := job.Payload["totalBytes"]; got != float64(wantSize) {
		t.Fatalf("payload.totalBytes=%v, want %d", got, wantSize)
	}
	items, ok := job.Payload["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("payload.items=%T %+v, want one item", job.Payload["items"], job.Payload["items"])
	}
	item, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("payload.items[0]=%T, want map", items[0])
	}
	if item["path"] != wantPath {
		t.Fatalf("payload.items[0].path=%v, want %q", item["path"], wantPath)
	}
	if item["key"] != wantKey {
		t.Fatalf("payload.items[0].key=%v, want %q", item["key"], wantKey)
	}
	if item["size"] != float64(wantSize) {
		t.Fatalf("payload.items[0].size=%v, want %d", item["size"], wantSize)
	}
	if job.Progress == nil || job.Progress.BytesTotal == nil || *job.Progress.BytesTotal != wantSize {
		t.Fatalf("job progress bytesTotal=%+v, want %d", job.Progress, wantSize)
	}
	if job.Progress.ObjectsTotal == nil || *job.Progress.ObjectsTotal != int64(wantFiles) {
		t.Fatalf("job progress objectsTotal=%+v, want %d", job.Progress, wantFiles)
	}
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

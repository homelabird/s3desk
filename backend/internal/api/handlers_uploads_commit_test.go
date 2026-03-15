package api

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestBuildVerifiedUploadCommitArtifactsUsesVerifiedState(t *testing.T) {
	artifacts := buildVerifiedUploadCommitArtifacts("upload-1", store.UploadSession{
		Bucket: "bucket-a",
		Prefix: "incoming",
	}, uploadCommitRequest{
		Label:    "  import  ",
		RootName: "  docs  ",
		RootKind: "folder",
	}, []verifiedUploadObject{
		{Path: "docs/readme.txt", Key: "incoming/docs/readme.txt", Size: 11},
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

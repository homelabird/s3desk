package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func newFolderMarkerS3Server(t *testing.T) (*httptest.Server, *string, *int) {
	t.Helper()

	var requestPath string
	var requestBytes int

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		requestPath = r.URL.EscapedPath()
		requestBytes = len(body)
		w.WriteHeader(http.StatusOK)
	})

	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv, &requestPath, &requestBytes
}

func TestHandleCreateFolder_S3CompatibleWritesZeroByteMarker(t *testing.T) {
	fakeS3, requestPath, requestBytes := newFolderMarkerS3Server(t)

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)

	res := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/buckets/test-bucket/objects/folder", profile.ID, models.CreateFolderRequest{
		Key: "folder/",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 201, got %d: %s", res.StatusCode, string(body))
	}

	var created models.CreateFolderResponse
	decodeJSONResponse(t, res, &created)
	if created.Key != "folder/" {
		t.Fatalf("created key = %q, want %q", created.Key, "folder/")
	}

	if *requestBytes != 0 {
		t.Fatalf("put body bytes = %d, want 0", *requestBytes)
	}
	if !strings.HasSuffix(*requestPath, "/test-bucket/folder/") {
		t.Fatalf("put path = %q, want suffix /test-bucket/folder/", *requestPath)
	}
}

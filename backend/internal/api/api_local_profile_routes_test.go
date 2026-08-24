package api

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestLocalProfileRoutesRemainAvailableWhenProviderConfigIsBlocked(t *testing.T) {
	localRoot := t.TempDir()
	st, manager, _, dataDir := newTestJobsServerWithAllowedDirs(t, testEncryptionKey(), false, []string{localRoot})
	profile := createTestProfile(t, st)

	srv := httptest.NewServer(New(Dependencies{
		Config: config.Config{
			DataDir:          dataDir,
			StaticDir:        dataDir,
			AllowRemote:      true,
			AllowedLocalDirs: []string{localRoot},
		},
		Store: st,
		Jobs:  manager,
		Hub:   ws.NewHub(),
	}))
	t.Cleanup(srv.Close)

	for _, tc := range []struct {
		name        string
		method      string
		path        string
		profileID   string
		payload     any
		wantStatus  int
		wantErrCode string
	}{
		{name: "missing profile", method: http.MethodGet, path: "/api/v1/buckets/test-bucket/objects/index-summary", wantStatus: http.StatusBadRequest, wantErrCode: "missing_profile"},
		{name: "unknown profile before invalid input", method: http.MethodGet, path: "/api/v1/buckets/test-bucket/objects/index-summary?sampleLimit=bad", profileID: "missing", wantStatus: http.StatusBadRequest, wantErrCode: "profile_not_found"},
		{name: "index summary", method: http.MethodGet, path: "/api/v1/buckets/test-bucket/objects/index-summary", profileID: profile.ID, wantStatus: http.StatusOK},
		{name: "indexed search", method: http.MethodGet, path: "/api/v1/buckets/test-bucket/objects/search?q=report", profileID: profile.ID, wantStatus: http.StatusConflict, wantErrCode: "not_indexed"},
		{name: "local entries", method: http.MethodGet, path: "/api/v1/local/entries", profileID: profile.ID, wantStatus: http.StatusOK},
		{name: "upload files missing profile", method: http.MethodPost, path: "/api/v1/uploads/missing/files", wantStatus: http.StatusBadRequest, wantErrCode: "missing_profile"},
		{name: "upload files unknown profile", method: http.MethodPost, path: "/api/v1/uploads/missing/files", profileID: "missing", wantStatus: http.StatusBadRequest, wantErrCode: "profile_not_found"},
		{name: "upload files missing session remains blocked", method: http.MethodPost, path: "/api/v1/uploads/missing/files", profileID: profile.ID, wantStatus: http.StatusBadRequest, wantErrCode: "invalid_config"},
		{name: "create favorite", method: http.MethodPost, path: "/api/v1/buckets/test-bucket/objects/favorites", profileID: profile.ID, payload: models.ObjectFavoriteCreateRequest{Key: "report.txt"}, wantStatus: http.StatusCreated},
		{name: "delete favorite", method: http.MethodDelete, path: "/api/v1/buckets/test-bucket/objects/favorites?key=report.txt", profileID: profile.ID, wantStatus: http.StatusNoContent},
		{name: "favorite hydration remains blocked", method: http.MethodGet, path: "/api/v1/buckets/test-bucket/objects/favorites?hydrate=false", profileID: profile.ID, wantStatus: http.StatusBadRequest, wantErrCode: "invalid_config"},
		{name: "provider route remains blocked", method: http.MethodGet, path: "/api/v1/buckets", profileID: profile.ID, wantStatus: http.StatusBadRequest, wantErrCode: "invalid_config"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := doJSONRequestWithProfile(t, srv, tc.method, tc.path, tc.profileID, tc.payload)
			defer res.Body.Close()
			if res.StatusCode != tc.wantStatus {
				body, _ := io.ReadAll(res.Body)
				t.Fatalf("status=%d, want %d: %s", res.StatusCode, tc.wantStatus, string(body))
			}
			if tc.wantErrCode == "" {
				return
			}
			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != tc.wantErrCode {
				t.Fatalf("error.code=%q, want %q", errResp.Error.Code, tc.wantErrCode)
			}
		})
	}
}

func TestUploadFilesProfileGateDependsOnSessionMode(t *testing.T) {
	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "", expiresAt)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	stagingDir, err := store.ResolveUploadStagingDir(dataDir, upload.ID)
	if err != nil {
		t.Fatalf("resolve staging dir: %v", err)
	}
	if err := os.MkdirAll(stagingDir, 0o700); err != nil {
		t.Fatalf("create staging dir: %v", err)
	}
	if err := st.SetUploadSessionStagingDir(context.Background(), profile.ID, upload.ID, stagingDir); err != nil {
		t.Fatalf("set staging dir: %v", err)
	}

	srv := httptest.NewServer(New(Dependencies{
		Config: config.Config{
			DataDir:            dataDir,
			StaticDir:          dataDir,
			AllowRemote:        true,
			UploadDirectStream: true,
		},
		Store: st,
		Jobs:  manager,
		Hub:   ws.NewHub(),
	}))
	t.Cleanup(srv.Close)

	uploadChunk := func(uploadID string) *http.Response {
		t.Helper()
		req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/uploads/"+uploadID+"/files", bytes.NewBufferString("x"))
		if err != nil {
			t.Fatalf("new request: %v", err)
		}
		req.Header.Set("X-Profile-Id", profile.ID)
		req.Header.Set("X-Upload-Chunk-Index", "0")
		req.Header.Set("X-Upload-Chunk-Total", "1")
		req.Header.Set("X-Upload-Chunk-Size", "1")
		req.Header.Set("X-Upload-File-Size", "1")
		req.Header.Set("X-Upload-Relative-Path", "file.txt")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("upload chunk: %v", err)
		}
		return res
	}

	res := uploadChunk(upload.ID)
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d, want %d: %s", res.StatusCode, http.StatusNoContent, string(body))
	}
	body, err := os.ReadFile(filepath.Join(stagingDir, "file.txt"))
	if err != nil {
		t.Fatalf("read staged file: %v", err)
	}
	if string(body) != "x" {
		t.Fatalf("staged body=%q, want x", string(body))
	}

	assertInvalidConfig := func(name string, res *http.Response) {
		t.Helper()
		defer res.Body.Close()
		if res.StatusCode != http.StatusBadRequest {
			body, _ := io.ReadAll(res.Body)
			t.Fatalf("%s status=%d, want %d: %s", name, res.StatusCode, http.StatusBadRequest, string(body))
		}
		var errResp models.ErrorResponse
		decodeJSONResponse(t, res, &errResp)
		if errResp.Error.Code != "invalid_config" {
			t.Fatalf("%s error.code=%q, want invalid_config", name, errResp.Error.Code)
		}
	}

	direct, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeDirect, "", expiresAt)
	if err != nil {
		t.Fatalf("create direct upload session: %v", err)
	}
	assertInvalidConfig("direct", uploadChunk(direct.ID))

	expired, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", uploadModeStaging, "present", time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("create expired upload session: %v", err)
	}
	assertInvalidConfig("expired staging", uploadChunk(expired.ID))
}

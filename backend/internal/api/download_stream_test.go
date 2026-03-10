package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

type eofOnceReader struct {
	data []byte
}

func (r *eofOnceReader) Read(p []byte) (int, error) {
	if len(r.data) == 0 {
		return 0, io.EOF
	}
	n := copy(p, r.data)
	r.data = nil
	return n, io.EOF
}

func (r *eofOnceReader) Close() error {
	return nil
}

func installDownloadStartRcloneHook(
	t *testing.T,
	hook func(args []string) (*rcloneProcess, error),
) {
	t.Helper()
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		startRclone: func(_ *server, _ context.Context, _ models.ProfileSecrets, args []string, _ string) (*rcloneProcess, error) {
			return hook(args)
		},
	})
	t.Cleanup(restore)
}

func TestStreamRcloneDownload_ConvertsEarlyProcessFailureToJSONError(t *testing.T) {
	t.Parallel()

	s := &server{}
	proc := &rcloneProcess{
		stdout: &eofOnceReader{data: []byte("abc")},
		stderr: bytes.NewBufferString("simulated cat failure"),
		wait: func() error {
			return errors.New("exit status 1")
		},
	}

	rr := httptest.NewRecorder()
	s.streamRcloneDownload(rr, proc, rcloneListEntry{Size: 3}, "report.txt", rcloneAPIErrorContext{
		MissingMessage: "missing",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to download object",
	}, map[string]any{"bucket": "test-bucket", "key": "report.txt"})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "s3_error" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "s3_error")
	}
	if resp.Error.Message != "failed to download object" {
		t.Fatalf("error.message=%q, want %q", resp.Error.Message, "failed to download object")
	}
}

func TestHandleDownloadObject_ReturnsErrorWhenCatFailsBeforeBody(t *testing.T) {
	lockTestEnv(t)
	installDownloadStartRcloneHook(t, func(args []string) (*rcloneProcess, error) {
		if len(args) >= 3 && args[0] == "lsjson" && args[1] == "--stat" {
			return &rcloneProcess{
				stdout: io.NopCloser(strings.NewReader("{\"Path\":\"report.txt\",\"Name\":\"report.txt\",\"Size\":5,\"ModTime\":\"2024-01-01T00:00:00Z\",\"Hashes\":{\"MD5\":\"abc\"}}\n")),
				stderr: &bytes.Buffer{},
				wait:   func() error { return nil },
			}, nil
		}
		if len(args) >= 1 && args[0] == "cat" {
			return &rcloneProcess{
				stdout: &eofOnceReader{},
				stderr: bytes.NewBufferString("simulated cat failure"),
				wait:   func() error { return errors.New("exit status 1") },
			}, nil
		}
		return nil, errors.New("unexpected rclone args")
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequestWithProfile(t, srv, http.MethodGet, "/api/v1/buckets/test-bucket/objects/download?key=report.txt", profile.ID, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 400, got %d: %s", res.StatusCode, string(body))
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "s3_error" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "s3_error")
	}
	if !strings.Contains(detailString(resp.Error.Details["error"]), "simulated cat failure") {
		t.Fatalf("expected stderr details, got %#v", resp.Error.Details)
	}
}

func TestHandleDownloadProxy_ReturnsErrorWhenCatFailsBeforeBody(t *testing.T) {
	lockTestEnv(t)
	installDownloadStartRcloneHook(t, func(args []string) (*rcloneProcess, error) {
		if len(args) >= 3 && args[0] == "lsjson" && args[1] == "--stat" {
			return &rcloneProcess{
				stdout: io.NopCloser(strings.NewReader("{\"Path\":\"report.txt\",\"Name\":\"report.txt\",\"Size\":5,\"ModTime\":\"2024-01-01T00:00:00Z\",\"Hashes\":{\"MD5\":\"abc\"}}\n")),
				stderr: &bytes.Buffer{},
				wait:   func() error { return nil },
			}, nil
		}
		if len(args) >= 1 && args[0] == "cat" {
			return &rcloneProcess{
				stdout: &eofOnceReader{},
				stderr: bytes.NewBufferString("simulated cat failure"),
				wait:   func() error { return errors.New("exit status 1") },
			}, nil
		}
		return nil, errors.New("unexpected rclone args")
	})

	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	s := &server{
		cfg:         config.Config{DataDir: dataDir},
		store:       st,
		proxySecret: resolveProxySecret("proxy-test-token"),
	}

	token := downloadProxyToken{
		ProfileID: profile.ID,
		Bucket:    "test-bucket",
		Key:       "report.txt",
		Expires:   time.Now().UTC().Add(time.Minute).Unix(),
	}
	params := url.Values{}
	params.Set("profileId", token.ProfileID)
	params.Set("bucket", token.Bucket)
	params.Set("key", token.Key)
	params.Set("expires", strconv.FormatInt(token.Expires, 10))
	params.Set("sig", s.signDownloadProxy(token))

	req := httptest.NewRequest(http.MethodGet, "/download-proxy?"+params.Encode(), nil)
	rr := httptest.NewRecorder()
	s.handleDownloadProxy(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusBadRequest, rr.Body.String())
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "s3_error" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "s3_error")
	}
	if !strings.Contains(detailString(resp.Error.Details["error"]), "simulated cat failure") {
		t.Fatalf("expected stderr details, got %#v", resp.Error.Details)
	}
}

func TestHandleDownloadProxy_SkipsStatWhenSignedMetadataIsEmbedded(t *testing.T) {
	lockTestEnv(t)
	installDownloadStartRcloneHook(t, func(args []string) (*rcloneProcess, error) {
		if len(args) >= 3 && args[0] == "lsjson" && args[1] == "--stat" {
			t.Fatalf("stat should not be called")
		}
		if len(args) >= 1 && args[0] == "cat" {
			return &rcloneProcess{
				stdout: &eofOnceReader{data: []byte("hello")},
				stderr: &bytes.Buffer{},
				wait:   func() error { return nil },
			}, nil
		}
		return nil, errors.New("unexpected rclone args")
	})

	st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	s := &server{
		cfg:         config.Config{DataDir: dataDir},
		store:       st,
		proxySecret: resolveProxySecret("proxy-test-token"),
	}

	token := downloadProxyToken{
		ProfileID:    profile.ID,
		Bucket:       "test-bucket",
		Key:          "report.txt",
		Expires:      time.Now().UTC().Add(time.Minute).Unix(),
		Size:         5,
		ContentType:  "text/plain",
		LastModified: "2024-01-01T00:00:00Z",
	}
	params := url.Values{}
	params.Set("profileId", token.ProfileID)
	params.Set("bucket", token.Bucket)
	params.Set("key", token.Key)
	params.Set("expires", strconv.FormatInt(token.Expires, 10))
	params.Set("size", strconv.FormatInt(token.Size, 10))
	params.Set("contentType", token.ContentType)
	params.Set("lastModified", token.LastModified)
	params.Set("sig", s.signDownloadProxy(token))

	req := httptest.NewRequest(http.MethodGet, "/download-proxy?"+params.Encode(), nil)
	rr := httptest.NewRecorder()
	s.handleDownloadProxy(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d body=%s", rr.Code, http.StatusOK, rr.Body.String())
	}
	if body := rr.Body.String(); body != "hello" {
		t.Fatalf("body=%q, want %q", body, "hello")
	}
}

func detailString(v any) string {
	s, _ := v.(string)
	return s
}

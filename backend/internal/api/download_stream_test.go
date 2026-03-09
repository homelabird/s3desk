package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
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

func writeFakeDownloadRclone(t *testing.T, catBody string) string {
	t.Helper()
	return writeFakeRclone(t, ""+
		"cmd=''\n"+
		"want_stat=0\n"+
		"for arg in \"$@\"; do\n"+
		"  if [ \"$arg\" = \"lsjson\" ]; then cmd='lsjson'; fi\n"+
		"  if [ \"$arg\" = \"--stat\" ]; then want_stat=1; fi\n"+
		"  if [ \"$arg\" = \"cat\" ]; then cmd='cat'; fi\n"+
		"done\n"+
		"if [ \"$cmd\" = \"lsjson\" ] && [ \"$want_stat\" = \"1\" ]; then\n"+
		"  printf '{\"Path\":\"report.txt\",\"Name\":\"report.txt\",\"Size\":5,\"ModTime\":\"2024-01-01T00:00:00Z\",\"Hashes\":{\"MD5\":\"abc\"}}\\n'\n"+
		"  exit 0\n"+
		"fi\n"+
		"if [ \"$cmd\" = \"cat\" ]; then\n"+
		catBody+
		"fi\n"+
		"printf 'unexpected rclone args: %s\\n' \"$*\" >&2\n"+
		"exit 1\n")
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
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone uses a shell script")
	}

	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeDownloadRclone(t, "printf 'simulated cat failure\\n' >&2\nexit 1\n"))

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
	if runtime.GOOS == "windows" {
		t.Skip("fake rclone uses a shell script")
	}

	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeDownloadRclone(t, "printf 'simulated cat failure\\n' >&2\nexit 1\n"))

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

func detailString(v any) string {
	s, _ := v.(string)
	return s
}

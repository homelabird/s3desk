package api

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestUploadMultipartFormByteLimitAllowsEmptyFiles(t *testing.T) {
	for _, mode := range []string{uploadModeStaging, uploadModeDirect} {
		for _, tc := range []struct {
			name     string
			initial  int
			payloads []string
			status   int
		}{
			{name: "already at quota", initial: 10, payloads: []string{""}, status: http.StatusNoContent},
			{name: "previous part fills quota", payloads: []string{"0123456789", ""}, status: http.StatusNoContent},
			{name: "nonempty file at quota", initial: 10, payloads: []string{"ab"}, status: http.StatusRequestEntityTooLarge},
			{name: "already over quota", initial: 11, payloads: []string{""}, status: http.StatusRequestEntityTooLarge},
		} {
			t.Run(mode+"/"+tc.name, func(t *testing.T) {
				st, _, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
				profile := createTestProfile(t, st)
				stagingDir := t.TempDir()
				upload, err := st.CreateUploadSession(context.Background(), profile.ID, "test-bucket", "incoming", mode, stagingDir, time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano))
				if err != nil {
					t.Fatal(err)
				}
				if err := st.AddUploadSessionBytes(context.Background(), profile.ID, upload.ID, int64(tc.initial)); err != nil {
					t.Fatal(err)
				}
				upload.Bytes = int64(tc.initial)
				initialBody := strings.Repeat("x", tc.initial)
				if mode == uploadModeStaging && tc.initial > 0 {
					if err := os.WriteFile(filepath.Join(stagingDir, "existing.bin"), []byte(initialBody), 0o600); err != nil {
						t.Fatal(err)
					}
				}
				var captureCalls, stdinCalls [][]string
				var streamed []string
				if mode == uploadModeDirect {
					installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
						captureCalls = append(captureCalls, append([]string(nil), args...))
						return "", "", nil
					})
					installAPIRcloneStdinHook(t, func(_ models.ProfileSecrets, args []string, stdin io.Reader) (string, error) {
						body, err := io.ReadAll(stdin)
						stdinCalls = append(stdinCalls, append([]string(nil), args...))
						streamed = append(streamed, string(body))
						return "", err
					})
				}
				var body bytes.Buffer
				writer := multipart.NewWriter(&body)
				for i, payload := range tc.payloads {
					part, err := writer.CreateFormFile("files", "file-"+strconv.Itoa(i)+".bin")
					if err != nil {
						t.Fatal(err)
					}
					if _, err := io.WriteString(part, payload); err != nil {
						t.Fatal(err)
					}
				}
				if err := writer.Close(); err != nil {
					t.Fatal(err)
				}
				req := httptest.NewRequest(http.MethodPost, "/files", &body)
				req.Header.Set("Content-Type", writer.FormDataContentType())
				req = withProfileSecrets(req, models.ProfileSecrets{ID: profile.ID, Provider: models.ProfileProviderS3Compatible})
				rr := httptest.NewRecorder()
				srv := &server{cfg: config.Config{DataDir: dataDir, UploadMaxBytes: 10}, store: st}
				if mode == uploadModeDirect {
					newUploadDirectHTTPService(srv).handleDirectMultipartFormUpload(rr, req, profile.ID, upload.ID, upload)
				} else {
					newUploadStagingHTTPService(srv).handleStagingMultipartFormUpload(rr, req, profile.ID, upload.ID, stagingDir, upload.Bytes)
				}
				if rr.Code != tc.status {
					t.Fatalf("status=%d want=%d: %s", rr.Code, tc.status, rr.Body.String())
				}
				wantBytes := int64(tc.initial)
				wantFiles := 0
				if tc.status == http.StatusNoContent {
					wantFiles = len(tc.payloads)
					for _, payload := range tc.payloads {
						wantBytes += int64(len(payload))
					}
				}
				assertUploadSessionBytesForAPI(t, st, profile.ID, upload.ID, wantBytes)
				if mode == uploadModeStaging {
					if tc.initial > 0 {
						wantFiles++
						if body, err := os.ReadFile(filepath.Join(stagingDir, "existing.bin")); err != nil || string(body) != initialBody {
							t.Fatalf("existing file changed: body=%q err=%v", body, err)
						}
					}
					entries, err := os.ReadDir(stagingDir)
					if err != nil || len(entries) != wantFiles {
						t.Fatalf("files=%d want=%d err=%v", len(entries), wantFiles, err)
					}
					if tc.status == http.StatusNoContent {
						for i, payload := range tc.payloads {
							if body, err := os.ReadFile(filepath.Join(stagingDir, "file-"+strconv.Itoa(i)+".bin")); err != nil || string(body) != payload {
								t.Fatalf("uploaded file %d: body=%q err=%v", i, body, err)
							}
						}
					}
					return
				}
				objects, err := st.ListUploadObjects(context.Background(), profile.ID, upload.ID)
				if err != nil || len(objects) != wantFiles {
					t.Fatalf("objects=%d want=%d err=%v", len(objects), wantFiles, err)
				}
				if tc.status != http.StatusNoContent {
					assertNoRcloneCommand(t, captureCalls, "moveto")
					if tc.initial == 10 && len(streamed) > 0 {
						if len(streamed) != 1 || streamed[0] != "a" {
							t.Fatalf("streamed=%q, want one sentinel byte", streamed)
						}
						assertRcloneDeletefileTempTarget(t, captureCalls, upload.ID, "incoming/file-0.bin")
					} else if tc.initial > 10 && len(stdinCalls) != 0 {
						t.Fatalf("over-quota session streamed an object: %v", stdinCalls)
					}
					return
				}
				if len(streamed) != wantFiles || len(captureCalls) != wantFiles {
					t.Fatalf("streamed=%d promotions=%d want=%d", len(streamed), len(captureCalls), wantFiles)
				}
				for i, payload := range tc.payloads {
					name := "file-" + strconv.Itoa(i) + ".bin"
					if streamed[i] != payload || objects[i].Path != name || objects[i].ExpectedSize == nil || *objects[i].ExpectedSize != int64(len(payload)) {
						t.Fatalf("uploaded object %d: streamed=%q metadata=%+v", i, streamed[i], objects[i])
					}
					assertRcloneStdinTempTarget(t, stdinCalls[i:i+1], upload.ID, "incoming/"+name)
					assertRcloneMovetoTempToFinal(t, captureCalls[i:i+1], upload.ID, "incoming/"+name)
				}
			})
		}
	}
}

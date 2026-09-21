package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/ws"
)

// Full API regression: requires the project's normal Go dependencies/SQLite.
func TestJobArtifactBrowserTicketHTTP(t *testing.T) {
	st, manager, _, dataDir := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	otherProfile := createTestProfile(t, st)
	job := createStoredJob(t, st, profile.ID, jobs.JobTypeS3ZipPrefix, map[string]any{"bucket": "bucket", "prefix": "reports/"})
	finished := time.Now().UTC().Format(time.RFC3339Nano)
	if err := st.UpdateJobStatus(context.Background(), job.ID, models.JobStatusSucceeded, nil, &finished, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(dataDir, "artifacts", "jobs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	filename := filepath.Join(dir, job.ID+".zip")
	if err := os.WriteFile(filename, []byte("0123456789"), 0o600); err != nil {
		t.Fatal(err)
	}
	const token = "test-only-api-token"
	srv := httptest.NewServer(New(Dependencies{
		Config: config.Config{Addr: "127.0.0.1:0", DataDir: dataDir, StaticDir: dataDir, EncryptionKey: testEncryptionKey(), APIToken: token},
		Store:  st, Jobs: manager, Hub: ws.NewHub(), ServerAddr: "127.0.0.1:0",
	}))
	defer srv.Close()
	send := func(method, target, profileID, apiToken, byteRange string) *http.Response {
		t.Helper()
		req, err := http.NewRequest(method, target, nil)
		if err != nil {
			t.Fatal(err)
		}
		if profileID != "" {
			req.Header.Set("X-Profile-Id", profileID)
		}
		if apiToken != "" {
			req.Header.Set("X-Api-Token", apiToken)
		}
		if byteRange != "" {
			req.Header.Set("Range", byteRange)
		}
		res, err := srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = res.Body.Close() })
		return res
	}
	endpoint := srv.URL + "/api/v1/jobs/" + job.ID + "/artifact-url"
	if res := send("GET", endpoint, profile.ID, "", ""); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated issuance=%d", res.StatusCode)
	}
	if res := send("GET", endpoint, otherProfile.ID, token, ""); res.StatusCode != http.StatusNotFound {
		t.Fatalf("cross-profile issuance=%d", res.StatusCode)
	}
	res := send("GET", endpoint, profile.ID, token, "")
	if res.StatusCode != 200 {
		t.Fatalf("issuance=%d", res.StatusCode)
	}
	if res.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("issuance may be cached")
	}
	var link models.PresignedURLResponse
	if err := json.NewDecoder(res.Body).Decode(&link); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(link.URL, token) {
		t.Fatal("API token leaked into link")
	}
	for _, method := range []string{"GET", "HEAD"} {
		response := send(method, link.URL, "", "", "")
		if response.StatusCode != 200 {
			t.Fatalf("%s status=%d", method, response.StatusCode)
		}
		if !strings.Contains(response.Header.Get("Content-Disposition"), "attachment") {
			t.Fatal("not attachment")
		}
		body, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		if method == "GET" && string(body) != "0123456789" {
			t.Fatalf("body=%q", body)
		}
		if method == "HEAD" && len(body) != 0 {
			t.Fatal("HEAD has a body")
		}
	}
	response := send("GET", link.URL, "", "", "bytes=2-4")
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 206 || string(body) != "234" {
		t.Fatalf("range=%d %q", response.StatusCode, body)
	}
	for _, field := range []string{"profileId", "jobId", "expires", "sig"} {
		target, err := url.Parse(link.URL)
		if err != nil {
			t.Fatal(err)
		}
		values := target.Query()
		values.Set(field, "tampered")
		target.RawQuery = values.Encode()
		if res := send("GET", target.String(), "", "", ""); res.StatusCode != 403 {
			t.Fatalf("tampered %s=%d", field, res.StatusCode)
		}
	}
	if res := send("GET", link.URL+"&sig=duplicate", "", "", ""); res.StatusCode != 403 {
		t.Fatalf("duplicate signature=%d", res.StatusCode)
	}
	if err := os.Remove(filename); err != nil {
		t.Fatal(err)
	}
	if res := send("GET", link.URL, "", "", ""); res.StatusCode != 404 {
		t.Fatalf("deleted artifact=%d", res.StatusCode)
	}
}

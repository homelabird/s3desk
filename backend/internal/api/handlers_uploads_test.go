package api

import (
	"context"
	"io"
	"net/http"
	"testing"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestSanitizeUploadPath(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{in: "", want: ""},
		{in: "   ", want: ""},
		{in: ".", want: ""},
		{in: "..", want: ""},
		{in: "/", want: ""},
		{in: "a.txt", want: "a.txt"},
		{in: "a/b.txt", want: "a/b.txt"},
		{in: "a\\b\\c.txt", want: "a/b/c.txt"},
		{in: "../c.txt", want: ""},
		{in: "a/../c.txt", want: "c.txt"},
		{in: "dir/", want: "dir"},
		{in: "  spaced name.txt  ", want: "spaced name.txt"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.in, func(t *testing.T) {
			t.Parallel()
			got := sanitizeUploadPath(tc.in)
			if got != tc.want {
				t.Fatalf("sanitizeUploadPath(%q)=%q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestCommitUploadQueueFullRollsBackCreatedJob(t *testing.T) {
	t.Setenv("JOB_QUEUE_CAPACITY", "1")
	t.Setenv("RCLONE_PATH", writeFakeRclone(t, "exit 0\n"))

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	createRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads", profile.ID, models.UploadCreateRequest{
		Bucket: "test-bucket",
		Mode:   "staging",
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

	_ = createJob(t, srv, profile.ID, jobs.JobTypeS3DeleteObjects, map[string]any{
		"bucket": "test-bucket",
		"keys":   []any{"filler.txt"},
	})

	commitRes := doJSONRequestWithProfile(t, srv, http.MethodPost, "/api/v1/uploads/"+upload.UploadID+"/commit", profile.ID, nil)
	defer commitRes.Body.Close()
	if commitRes.StatusCode != http.StatusTooManyRequests {
		body, _ := io.ReadAll(commitRes.Body)
		t.Fatalf("expected status 429, got %d: %s", commitRes.StatusCode, string(body))
	}
	if retry := commitRes.Header.Get("Retry-After"); retry != "2" {
		t.Fatalf("expected Retry-After 2, got %q", retry)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, commitRes, &errResp)
	if errResp.Error.Code != "job_queue_full" {
		t.Fatalf("expected job_queue_full, got %q", errResp.Error.Code)
	}

	jobType := jobs.JobTypeTransferSyncStagingToS3
	listed, err := st.ListJobs(context.Background(), profile.ID, store.JobFilter{Type: &jobType, Limit: 10})
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if len(listed.Items) != 0 {
		t.Fatalf("expected no persisted staging commit jobs, got %d", len(listed.Items))
	}

	_, ok, err := st.GetUploadSession(context.Background(), profile.ID, upload.UploadID)
	if err != nil {
		t.Fatalf("get upload session: %v", err)
	}
	if !ok {
		t.Fatalf("expected upload session to remain after queue-full commit failure")
	}
}

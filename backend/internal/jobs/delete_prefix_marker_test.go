package jobs

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestRunTransferDeletePrefixDeletesMarkerWhenPrefixIsEmpty(t *testing.T) {
	manager, st, _, _, _, _ := newManagerConsistencyFixture(t)

	var (
		listCalls   atomic.Int32
		deleteCalls atomic.Int32
		deletePath  atomic.Value
	)

	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Query().Get("list-type") == "2":
			listCalls.Add(1)
			w.Header().Set("Content-Type", "application/xml")
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bucket-a</Name>
  <Prefix>folder/</Prefix>
  <KeyCount>1</KeyCount>
  <MaxKeys>2</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <Contents><Key>folder/</Key><Size>0</Size></Contents>
</ListBucketResult>`))
		case r.Method == http.MethodDelete:
			deleteCalls.Add(1)
			deletePath.Store(r.URL.Path)
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	t.Cleanup(fakeS3.Close)

	profile := createDeletePrefixTestProfile(t, st, fakeS3.URL)
	t.Setenv("RCLONE_PATH", writeJobsFakeRclone(t, "exit 0\n"))

	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type: JobTypeTransferDeletePrefix,
		Payload: map[string]any{
			"bucket":            "bucket-a",
			"prefix":            "folder/",
			"deleteAll":         false,
			"allowUnsafePrefix": false,
			"include":           []string{},
			"exclude":           []string{},
			"dryRun":            false,
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	if err := manager.runJob(context.Background(), job.ID); err != nil {
		t.Fatalf("run job: %v", err)
	}

	if listCalls.Load() == 0 {
		t.Fatalf("expected ListObjectsV2 to be called")
	}
	if deleteCalls.Load() != 1 {
		t.Fatalf("delete calls = %d, want 1", deleteCalls.Load())
	}
	path, _ := deletePath.Load().(string)
	if !strings.HasSuffix(path, "/bucket-a/folder/") {
		t.Fatalf("delete path = %q, want suffix /bucket-a/folder/", path)
	}
}

func createDeletePrefixTestProfile(t *testing.T, st *store.Store, endpoint string) models.Profile {
	t.Helper()

	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := true

	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  fmt.Sprintf("delete-prefix-%s", strings.ReplaceAll(t.Name(), "/", "-")),
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

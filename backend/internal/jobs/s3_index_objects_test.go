package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestRunS3IndexObjectsFullReindexFailurePreservesExistingIndex(t *testing.T) {
	dataDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dataDir, "logs", "jobs"), 0o700); err != nil {
		t.Fatalf("mkdir logs: %v", err)
	}

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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := false
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "test",
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

	ctx := context.Background()
	oldIndexedAt := "2026-03-07T12:00:00Z"
	if err := st.UpsertObjectIndexBatch(ctx, profile.ID, "bucket-a", []store.ObjectIndexEntry{
		{Key: "existing/file.txt", Size: 12},
	}, oldIndexedAt); err != nil {
		t.Fatalf("seed object index: %v", err)
	}

	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              ws.NewHub(),
		Concurrency:      1,
		UploadSessionTTL: time.Minute,
	})

	job, err := st.CreateJob(ctx, profile.ID, store.CreateJobInput{
		Type: JobTypeS3IndexObjects,
		Payload: map[string]any{
			"bucket":      "bucket-a",
			"fullReindex": true,
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	installJobsStartRcloneHook(t, func(_ context.Context, _ models.ProfileSecrets, _ string, args []string) (*rcloneProcess, error) {
		if len(args) < 2 || args[0] != "lsjson" || args[1] != "-R" {
			return nil, fmt.Errorf("unexpected rclone args: %v", args)
		}
		return newTestRcloneProcess(mustMarshalRcloneList(t, buildObjectIndexTestEntries(500)), "boom", errors.New("exit status 1")), nil
	})

	err = manager.runS3IndexObjects(ctx, profile.ID, job.ID, map[string]any{
		"bucket":      "bucket-a",
		"fullReindex": true,
	}, false)
	if err == nil {
		t.Fatalf("expected reindex error")
	}

	summary, err := st.SummarizeObjectIndex(ctx, profile.ID, store.SummarizeObjectIndexInput{
		Bucket:      "bucket-a",
		SampleLimit: 5,
	})
	if err != nil {
		t.Fatalf("summarize object index: %v", err)
	}
	if summary.ObjectCount != 1 {
		t.Fatalf("object count = %d, want 1", summary.ObjectCount)
	}
	if summary.TotalBytes != 12 {
		t.Fatalf("total bytes = %d, want 12", summary.TotalBytes)
	}
	if summary.IndexedAt == nil || *summary.IndexedAt != oldIndexedAt {
		t.Fatalf("indexedAt = %v, want %s", summary.IndexedAt, oldIndexedAt)
	}

	var stagedCount int64
	if err := gormDB.WithContext(ctx).Table("object_index_replacements").Where("replacement_id = ?", job.ID).Count(&stagedCount).Error; err != nil {
		t.Fatalf("count staged rows: %v", err)
	}
	if stagedCount != 0 {
		t.Fatalf("staged rows remaining = %d, want 0", stagedCount)
	}
}

func buildObjectIndexTestEntries(count int) []rcloneListEntry {
	entries := make([]rcloneListEntry, 0, count)
	for i := 0; i < count; i++ {
		entries = append(entries, rcloneListEntry{
			Path: fmt.Sprintf("new/file-%03d.txt", i),
			Size: int64(i + 1),
		})
	}
	return entries
}

func mustMarshalRcloneList(t *testing.T, entries []rcloneListEntry) string {
	t.Helper()
	data, err := json.Marshal(entries)
	if err != nil {
		t.Fatalf("marshal rclone list: %v", err)
	}
	return string(data)
}

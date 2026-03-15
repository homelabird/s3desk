package store

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
)

func TestSummarizeObjectIndexReturnsZeroSummaryForMissingPrefixInIndexedBucket(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	if err := st.UpsertObjectIndexBatch(ctx, profile.ID, "bucket-a", []ObjectIndexEntry{
		{Key: "existing/file.txt", Size: 12},
	}, "2026-03-07T12:00:00Z"); err != nil {
		t.Fatalf("upsert object index: %v", err)
	}

	summary, err := st.SummarizeObjectIndex(ctx, profile.ID, SummarizeObjectIndexInput{
		Bucket:      "bucket-a",
		Prefix:      "missing/",
		SampleLimit: 5,
	})
	if err != nil {
		t.Fatalf("summarize object index: %v", err)
	}

	if summary.ObjectCount != 0 {
		t.Fatalf("object count = %d, want 0", summary.ObjectCount)
	}
	if summary.TotalBytes != 0 {
		t.Fatalf("total bytes = %d, want 0", summary.TotalBytes)
	}
	if len(summary.SampleKeys) != 0 {
		t.Fatalf("sample keys = %v, want empty", summary.SampleKeys)
	}
	if summary.IndexedAt == nil || *summary.IndexedAt != "2026-03-07T12:00:00Z" {
		t.Fatalf("indexedAt = %v, want 2026-03-07T12:00:00Z", summary.IndexedAt)
	}
}

func TestSummarizeObjectIndexReturnsNotFoundForUnindexedBucket(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	_, err := st.SummarizeObjectIndex(ctx, profile.ID, SummarizeObjectIndexInput{
		Bucket:      "bucket-a",
		Prefix:      "missing/",
		SampleLimit: 5,
	})
	if !errors.Is(err, ErrObjectIndexNotFound) {
		t.Fatalf("expected ErrObjectIndexNotFound, got %v", err)
	}
}

func TestFinalizeObjectIndexReplacementIsAtomicForReaders(t *testing.T) {
	sqlitePath := filepath.Join(t.TempDir(), "s3desk.db")
	writer := newTestStoreAt(t, sqlitePath)
	reader := newTestStoreAt(t, sqlitePath)
	profile := createTestProfile(t, writer)
	ctx := context.Background()

	oldIndexedAt := "2026-03-07T12:00:00Z"
	oldEntries := []ObjectIndexEntry{
		{Key: "old/a.txt", Size: 3},
		{Key: "old/b.txt", Size: 7},
	}
	if err := writer.UpsertObjectIndexBatch(ctx, profile.ID, "bucket-a", oldEntries, oldIndexedAt); err != nil {
		t.Fatalf("seed object index: %v", err)
	}

	replacementID := "job-replace"
	newIndexedAt := "2026-03-08T12:00:00Z"
	var newTotalBytes int64
	newEntries := make([]ObjectIndexEntry, 0, 600)
	for i := 0; i < 600; i++ {
		size := int64(i + 1)
		newTotalBytes += size
		newEntries = append(newEntries, ObjectIndexEntry{
			Key:  fmt.Sprintf("new/file-%03d.txt", i),
			Size: size,
		})
	}
	if err := writer.StageObjectIndexReplacementBatch(ctx, replacementID, profile.ID, "bucket-a", newEntries[:250], newIndexedAt); err != nil {
		t.Fatalf("stage replacement batch 1: %v", err)
	}
	if err := writer.StageObjectIndexReplacementBatch(ctx, replacementID, profile.ID, "bucket-a", newEntries[250:], newIndexedAt); err != nil {
		t.Fatalf("stage replacement batch 2: %v", err)
	}

	tx := writer.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		t.Fatalf("begin transaction: %v", tx.Error)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if err := writer.finalizeObjectIndexReplacementTx(tx, replacementID, profile.ID, "bucket-a", ""); err != nil {
		t.Fatalf("finalize replacement tx: %v", err)
	}

	beforeCommit, err := reader.SummarizeObjectIndex(ctx, profile.ID, SummarizeObjectIndexInput{
		Bucket:      "bucket-a",
		SampleLimit: 5,
	})
	if err != nil {
		t.Fatalf("summarize before commit: %v", err)
	}
	if beforeCommit.ObjectCount != 2 {
		t.Fatalf("before commit object count = %d, want 2", beforeCommit.ObjectCount)
	}
	if beforeCommit.TotalBytes != 10 {
		t.Fatalf("before commit total bytes = %d, want 10", beforeCommit.TotalBytes)
	}
	if beforeCommit.IndexedAt == nil || *beforeCommit.IndexedAt != oldIndexedAt {
		t.Fatalf("before commit indexedAt = %v, want %s", beforeCommit.IndexedAt, oldIndexedAt)
	}

	if err := tx.Commit().Error; err != nil {
		t.Fatalf("commit replacement tx: %v", err)
	}
	committed = true

	afterCommit, err := reader.SummarizeObjectIndex(ctx, profile.ID, SummarizeObjectIndexInput{
		Bucket:      "bucket-a",
		SampleLimit: 5,
	})
	if err != nil {
		t.Fatalf("summarize after commit: %v", err)
	}
	if afterCommit.ObjectCount != int64(len(newEntries)) {
		t.Fatalf("after commit object count = %d, want %d", afterCommit.ObjectCount, len(newEntries))
	}
	if afterCommit.TotalBytes != newTotalBytes {
		t.Fatalf("after commit total bytes = %d, want %d", afterCommit.TotalBytes, newTotalBytes)
	}
	if afterCommit.IndexedAt == nil || *afterCommit.IndexedAt != newIndexedAt {
		t.Fatalf("after commit indexedAt = %v, want %s", afterCommit.IndexedAt, newIndexedAt)
	}

	var stagedCount int64
	if err := writer.db.WithContext(ctx).Model(&objectIndexReplacementRow{}).Where("replacement_id = ?", replacementID).Count(&stagedCount).Error; err != nil {
		t.Fatalf("count staged rows: %v", err)
	}
	if stagedCount != 0 {
		t.Fatalf("staged rows remaining = %d, want 0", stagedCount)
	}
}

func TestFinalizeObjectIndexReplacementRespectsPrefixScope(t *testing.T) {
	st := newTestStore(t)
	profile := createTestProfile(t, st)
	ctx := context.Background()

	if err := st.UpsertObjectIndexBatch(ctx, profile.ID, "bucket-a", []ObjectIndexEntry{
		{Key: "target/old.txt", Size: 3},
		{Key: "other/keep.txt", Size: 7},
	}, "2026-03-07T12:00:00Z"); err != nil {
		t.Fatalf("seed object index: %v", err)
	}

	replacementID := "job-prefix"
	if err := st.StageObjectIndexReplacementBatch(ctx, replacementID, profile.ID, "bucket-a", []ObjectIndexEntry{
		{Key: "target/new.txt", Size: 11},
		{Key: "other/rogue.txt", Size: 13},
	}, "2026-03-08T12:00:00Z"); err != nil {
		t.Fatalf("stage replacement: %v", err)
	}

	if err := st.FinalizeObjectIndexReplacement(ctx, replacementID, profile.ID, "bucket-a", "target/"); err != nil {
		t.Fatalf("finalize replacement: %v", err)
	}

	var rows []objectIndexRow
	if err := st.db.WithContext(ctx).
		Where("profile_id = ? AND bucket = ?", profile.ID, "bucket-a").
		Order("object_key ASC").
		Find(&rows).Error; err != nil {
		t.Fatalf("query object index rows: %v", err)
	}

	gotKeys := make([]string, 0, len(rows))
	for _, row := range rows {
		gotKeys = append(gotKeys, row.ObjectKey)
	}
	wantKeys := []string{"other/keep.txt", "target/new.txt"}
	if fmt.Sprint(gotKeys) != fmt.Sprint(wantKeys) {
		t.Fatalf("object keys = %v, want %v", gotKeys, wantKeys)
	}
}

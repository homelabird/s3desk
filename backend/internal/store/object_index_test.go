package store

import (
	"context"
	"errors"
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

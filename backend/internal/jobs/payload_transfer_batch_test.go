package jobs

import (
	"reflect"
	"testing"
)

func TestParseTransferBatchPayload(t *testing.T) {
	t.Run("parses valid payload", func(t *testing.T) {
		got, err := parseTransferBatchPayload(map[string]any{
			"srcBucket": "bucket-a",
			"dstBucket": "bucket-b",
			"dryRun":    true,
			"items": []any{
				map[string]any{"srcKey": "a.txt", "dstKey": "b.txt"},
				map[string]any{"srcKey": "c.txt", "dstKey": "d.txt"},
			},
		})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.SrcBucket != "bucket-a" || got.DstBucket != "bucket-b" || !got.DryRun {
			t.Fatalf("unexpected parsed payload: %+v", got)
		}
		wantItems := []transferBatchItemPayload{{SrcKey: "a.txt", DstKey: "b.txt"}, {SrcKey: "c.txt", DstKey: "d.txt"}}
		if !reflect.DeepEqual(got.Items, wantItems) {
			t.Fatalf("Items=%v want=%v", got.Items, wantItems)
		}
	})

	t.Run("errors when items contain non-object", func(t *testing.T) {
		_, err := parseTransferBatchPayload(map[string]any{
			"items": []any{"bad"},
		})
		if err == nil {
			t.Fatalf("expected error, got nil")
		}
		if err.Error() != "payload.items[0] must be an object" {
			t.Fatalf("error=%q want=%q", err.Error(), "payload.items[0] must be an object")
		}
	})

	t.Run("treats items type mismatch like missing", func(t *testing.T) {
		got, err := parseTransferBatchPayload(map[string]any{"items": "x"})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.Items != nil {
			t.Fatalf("Items=%v want=nil", got.Items)
		}
	})

	t.Run("errors on type mismatch for buckets/dryRun", func(t *testing.T) {
		_, err := parseTransferBatchPayload(map[string]any{"dryRun": "true"})
		if err == nil {
			t.Fatalf("expected error, got nil")
		}
		if err.Error() != "payload.dryRun must be a boolean" {
			t.Fatalf("error=%q want=%q", err.Error(), "payload.dryRun must be a boolean")
		}
	})
}

package jobs

import (
	"reflect"
	"testing"
)

func TestParseTransferCopyMovePrefixPayload(t *testing.T) {
	t.Run("parses valid payload", func(t *testing.T) {
		got, err := parseTransferCopyMovePrefixPayload(map[string]any{
			"srcBucket": "bucket-a",
			"srcPrefix": "src/",
			"dstBucket": "bucket-b",
			"dstPrefix": "dst/",
			"dryRun":    true,
			"include":   []any{"*.txt"},
			"exclude":   []string{"tmp/**"},
		})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.SrcBucket != "bucket-a" || got.SrcPrefix != "src/" || got.DstBucket != "bucket-b" || got.DstPrefix != "dst/" {
			t.Fatalf("unexpected parsed payload: %+v", got)
		}
		if !got.DryRun {
			t.Fatalf("DryRun=%v want=true", got.DryRun)
		}
		if !reflect.DeepEqual(got.Include, []string{"*.txt"}) {
			t.Fatalf("Include=%v want=%v", got.Include, []string{"*.txt"})
		}
		if !reflect.DeepEqual(got.Exclude, []string{"tmp/**"}) {
			t.Fatalf("Exclude=%v want=%v", got.Exclude, []string{"tmp/**"})
		}
	})

	t.Run("errors on type mismatch", func(t *testing.T) {
		_, err := parseTransferCopyMovePrefixPayload(map[string]any{"srcBucket": 1})
		if err == nil {
			t.Fatalf("expected error, got nil")
		}
		if err.Error() != "payload.srcBucket must be a string" {
			t.Fatalf("error=%q want=%q", err.Error(), "payload.srcBucket must be a string")
		}
	})
}

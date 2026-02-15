package jobs

import (
	"reflect"
	"testing"
)

func TestParseTransferSyncLocalPathPayload(t *testing.T) {
	t.Run("parses valid payload", func(t *testing.T) {
		got, err := parseTransferSyncLocalPathPayload(map[string]any{
			"bucket":           "bucket-a",
			"prefix":           "folder/",
			"localPath":        "/tmp",
			"dryRun":           true,
			"deleteExtraneous": true,
			"include":          []any{"*.txt"},
			"exclude":          []string{"tmp/**"},
		})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.Bucket != "bucket-a" || got.Prefix != "folder/" || got.LocalPath != "/tmp" {
			t.Fatalf("unexpected parsed payload: %+v", got)
		}
		if !got.DryRun || !got.DeleteExtraneous {
			t.Fatalf("expected dryRun/deleteExtraneous true, got dryRun=%v deleteExtraneous=%v", got.DryRun, got.DeleteExtraneous)
		}
		if !reflect.DeepEqual(got.Include, []string{"*.txt"}) {
			t.Fatalf("Include=%v want=%v", got.Include, []string{"*.txt"})
		}
		if !reflect.DeepEqual(got.Exclude, []string{"tmp/**"}) {
			t.Fatalf("Exclude=%v want=%v", got.Exclude, []string{"tmp/**"})
		}
	})

	t.Run("errors on type mismatch", func(t *testing.T) {
		_, err := parseTransferSyncLocalPathPayload(map[string]any{"dryRun": "true"})
		if err == nil {
			t.Fatalf("expected error, got nil")
		}
		if err.Error() != "payload.dryRun must be a boolean" {
			t.Fatalf("error=%q want=%q", err.Error(), "payload.dryRun must be a boolean")
		}
	})
}

package jobs

import (
	"reflect"
	"testing"
)

func TestParseTransferDeletePrefixPayload(t *testing.T) {
	t.Run("parses valid payload", func(t *testing.T) {
		payload := map[string]any{
			"bucket":            "bucket-a",
			"prefix":            "folder/",
			"deleteAll":         true,
			"dryRun":            true,
			"allowUnsafePrefix": true,
			"include":           []any{"*.txt", "*.csv"},
			"exclude":           []string{"tmp/**"},
		}

		got, err := parseTransferDeletePrefixPayload(payload)
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}

		if got.Bucket != "bucket-a" {
			t.Fatalf("Bucket=%q want=%q", got.Bucket, "bucket-a")
		}
		if got.Prefix != "folder/" {
			t.Fatalf("Prefix=%q want=%q", got.Prefix, "folder/")
		}
		if !got.DeleteAll || !got.DryRun || !got.AllowUnsafePrefix {
			t.Fatalf("expected bool fields true, got deleteAll=%v dryRun=%v allowUnsafePrefix=%v", got.DeleteAll, got.DryRun, got.AllowUnsafePrefix)
		}
		if !reflect.DeepEqual(got.Include, []string{"*.txt", "*.csv"}) {
			t.Fatalf("Include=%v want=%v", got.Include, []string{"*.txt", "*.csv"})
		}
		if !reflect.DeepEqual(got.Exclude, []string{"tmp/**"}) {
			t.Fatalf("Exclude=%v want=%v", got.Exclude, []string{"tmp/**"})
		}
	})

	t.Run("uses zero values for omitted optional fields", func(t *testing.T) {
		got, err := parseTransferDeletePrefixPayload(map[string]any{})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.Bucket != "" || got.Prefix != "" || got.DeleteAll || got.DryRun || got.AllowUnsafePrefix {
			t.Fatalf("unexpected non-zero payload: %+v", got)
		}
		if got.Include != nil || got.Exclude != nil {
			t.Fatalf("expected nil slices, got include=%v exclude=%v", got.Include, got.Exclude)
		}
	})
}

func TestParseTransferDeletePrefixPayloadTypeErrors(t *testing.T) {
	cases := []struct {
		name    string
		payload map[string]any
		wantErr string
	}{
		{
			name:    "bucket type",
			payload: map[string]any{"bucket": 10},
			wantErr: "payload.bucket must be a string",
		},
		{
			name:    "deleteAll type",
			payload: map[string]any{"deleteAll": "true"},
			wantErr: "payload.deleteAll must be a boolean",
		},
		{
			name:    "include must be array",
			payload: map[string]any{"include": "x"},
			wantErr: "payload.include must be an array of strings",
		},
		{
			name:    "include item type",
			payload: map[string]any{"include": []any{"ok", 3}},
			wantErr: "payload.include[1] must be a string",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseTransferDeletePrefixPayload(tc.payload)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if err.Error() != tc.wantErr {
				t.Fatalf("error=%q want=%q", err.Error(), tc.wantErr)
			}
		})
	}
}

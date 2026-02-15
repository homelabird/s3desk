package jobs

import (
	"reflect"
	"testing"
)

func TestParseS3ZipObjectsPayload(t *testing.T) {
	t.Run("parses valid payload", func(t *testing.T) {
		got, err := parseS3ZipObjectsPayload(map[string]any{
			"bucket":      "b",
			"keys":        []any{"a.txt", "b.txt"},
			"stripPrefix": "p/",
		})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.Bucket != "b" {
			t.Fatalf("Bucket=%q want=%q", got.Bucket, "b")
		}
		if !reflect.DeepEqual(got.Keys, []string{"a.txt", "b.txt"}) {
			t.Fatalf("Keys=%v want=%v", got.Keys, []string{"a.txt", "b.txt"})
		}
		if got.StripPrefix != "p/" {
			t.Fatalf("StripPrefix=%q want=%q", got.StripPrefix, "p/")
		}
	})

	t.Run("uses zero values for omitted optional fields", func(t *testing.T) {
		got, err := parseS3ZipObjectsPayload(map[string]any{})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.Bucket != "" || got.StripPrefix != "" {
			t.Fatalf("unexpected non-zero payload: %+v", got)
		}
		if got.Keys != nil {
			t.Fatalf("expected nil keys, got %v", got.Keys)
		}
	})
}

func TestParseS3ZipObjectsPayloadTypeErrors(t *testing.T) {
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
			name:    "keys must be array",
			payload: map[string]any{"keys": "x"},
			wantErr: "payload.keys must be an array of strings",
		},
		{
			name:    "keys item type",
			payload: map[string]any{"keys": []any{"ok", 3}},
			wantErr: "payload.keys[1] must be a string",
		},
		{
			name:    "stripPrefix type",
			payload: map[string]any{"stripPrefix": 10},
			wantErr: "payload.stripPrefix must be a string",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseS3ZipObjectsPayload(tc.payload)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if err.Error() != tc.wantErr {
				t.Fatalf("error=%q want=%q", err.Error(), tc.wantErr)
			}
		})
	}
}


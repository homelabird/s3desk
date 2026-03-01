package jobs

import "testing"

func TestParseS3IndexObjectsPayload(t *testing.T) {
	t.Run("parses valid payload with default fullReindex", func(t *testing.T) {
		got, err := parseS3IndexObjectsPayload(map[string]any{"bucket": "b", "prefix": "p/"})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.Bucket != "b" {
			t.Fatalf("Bucket=%q want=%q", got.Bucket, "b")
		}
		if got.Prefix != "p/" {
			t.Fatalf("Prefix=%q want=%q", got.Prefix, "p/")
		}
		if !got.FullReindex {
			t.Fatalf("FullReindex=%v want=%v", got.FullReindex, true)
		}
	})

	t.Run("parses valid payload with explicit fullReindex", func(t *testing.T) {
		got, err := parseS3IndexObjectsPayload(map[string]any{
			"bucket":      "b",
			"prefix":      "p/",
			"fullReindex": false,
		})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.FullReindex {
			t.Fatalf("FullReindex=%v want=%v", got.FullReindex, false)
		}
	})

	t.Run("uses zero values for omitted optional fields", func(t *testing.T) {
		got, err := parseS3IndexObjectsPayload(map[string]any{})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.Bucket != "" || got.Prefix != "" {
			t.Fatalf("unexpected non-zero payload: %+v", got)
		}
		if !got.FullReindex {
			t.Fatalf("FullReindex=%v want=%v", got.FullReindex, true)
		}
	})
}

func TestParseS3IndexObjectsPayloadTypeErrors(t *testing.T) {
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
			name:    "prefix type",
			payload: map[string]any{"prefix": 10},
			wantErr: "payload.prefix must be a string",
		},
		{
			name:    "fullReindex type",
			payload: map[string]any{"fullReindex": "true"},
			wantErr: "payload.fullReindex must be a boolean",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseS3IndexObjectsPayload(tc.payload)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if err.Error() != tc.wantErr {
				t.Fatalf("error=%q want=%q", err.Error(), tc.wantErr)
			}
		})
	}
}

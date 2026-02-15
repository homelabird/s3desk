package jobs

import "testing"

func TestParseTransferCopyMoveObjectPayload(t *testing.T) {
	t.Run("parses valid payload", func(t *testing.T) {
		got, err := parseTransferCopyMoveObjectPayload(map[string]any{
			"srcBucket": "bucket-a",
			"srcKey":    "src.txt",
			"dstBucket": "bucket-b",
			"dstKey":    "dst.txt",
			"dryRun":    true,
		})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.SrcBucket != "bucket-a" || got.SrcKey != "src.txt" || got.DstBucket != "bucket-b" || got.DstKey != "dst.txt" {
			t.Fatalf("unexpected parsed payload: %+v", got)
		}
		if !got.DryRun {
			t.Fatalf("DryRun=%v want=true", got.DryRun)
		}
	})

	t.Run("allows omitted optional fields", func(t *testing.T) {
		got, err := parseTransferCopyMoveObjectPayload(map[string]any{})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.SrcBucket != "" || got.SrcKey != "" || got.DstBucket != "" || got.DstKey != "" || got.DryRun {
			t.Fatalf("unexpected non-zero parsed payload: %+v", got)
		}
	})
}

func TestParseTransferCopyMoveObjectPayloadTypeErrors(t *testing.T) {
	cases := []struct {
		name    string
		payload map[string]any
		wantErr string
	}{
		{
			name:    "srcBucket type",
			payload: map[string]any{"srcBucket": 10},
			wantErr: "payload.srcBucket must be a string",
		},
		{
			name:    "dryRun type",
			payload: map[string]any{"dryRun": "true"},
			wantErr: "payload.dryRun must be a boolean",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseTransferCopyMoveObjectPayload(tc.payload)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if err.Error() != tc.wantErr {
				t.Fatalf("error=%q want=%q", err.Error(), tc.wantErr)
			}
		})
	}
}

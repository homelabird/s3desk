package jobs

import "testing"

func TestParseTransferSyncStagingToS3Payload(t *testing.T) {
	t.Run("parses valid payload", func(t *testing.T) {
		got, err := parseTransferSyncStagingToS3Payload(map[string]any{"uploadId": "u1"})
		if err != nil {
			t.Fatalf("parse payload: %v", err)
		}
		if got.UploadID != "u1" {
			t.Fatalf("UploadID=%q want=%q", got.UploadID, "u1")
		}
	})

	t.Run("errors on type mismatch", func(t *testing.T) {
		_, err := parseTransferSyncStagingToS3Payload(map[string]any{"uploadId": 1})
		if err == nil {
			t.Fatalf("expected error, got nil")
		}
		if err.Error() != "payload.uploadId must be a string" {
			t.Fatalf("error=%q want=%q", err.Error(), "payload.uploadId must be a string")
		}
	})
}

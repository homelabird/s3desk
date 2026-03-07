package api

import (
	"net/http"
	"testing"

	"s3desk/internal/models"
)

func TestHandleGetObjectIndexSummaryReturnsEmptySummaryWhenBucketIsNotIndexed(t *testing.T) {
	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequestWithProfile(
		t,
		srv,
		http.MethodGet,
		"/api/v1/buckets/test-bucket/objects/index-summary?prefix=missing/&sampleLimit=5",
		profile.ID,
		nil,
	)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}

	var resp models.ObjectIndexSummaryResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Bucket != "test-bucket" {
		t.Fatalf("bucket = %q, want test-bucket", resp.Bucket)
	}
	if resp.Prefix != "missing/" {
		t.Fatalf("prefix = %q, want missing/", resp.Prefix)
	}
	if resp.ObjectCount != 0 {
		t.Fatalf("objectCount = %d, want 0", resp.ObjectCount)
	}
	if resp.TotalBytes != 0 {
		t.Fatalf("totalBytes = %d, want 0", resp.TotalBytes)
	}
	if len(resp.SampleKeys) != 0 {
		t.Fatalf("sampleKeys = %v, want empty", resp.SampleKeys)
	}
	if resp.IndexedAt != nil {
		t.Fatalf("indexedAt = %v, want nil", resp.IndexedAt)
	}
}

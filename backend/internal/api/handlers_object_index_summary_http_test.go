package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/models"
)

func TestObjectIndexSummaryHTTPService_HandleGetObjectIndexSummary_ReturnsMissingProfile(t *testing.T) {
	t.Parallel()

	svc := newObjectIndexSummaryHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/objects/index-summary", nil)
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetObjectIndexSummary(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
}

func TestBuildEmptyObjectIndexSummaryResponse_TrimsLeadingSlash(t *testing.T) {
	t.Parallel()

	resp := buildEmptyObjectIndexSummaryResponse("demo", "/logs/")
	if resp.Bucket != "demo" {
		t.Fatalf("bucket=%q, want demo", resp.Bucket)
	}
	if resp.Prefix != "logs/" {
		t.Fatalf("prefix=%q, want logs/", resp.Prefix)
	}
	if resp.ObjectCount != 0 || resp.TotalBytes != 0 || len(resp.SampleKeys) != 0 {
		t.Fatalf("resp=%+v, want empty summary", resp)
	}
}

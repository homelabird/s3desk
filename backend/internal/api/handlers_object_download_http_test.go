package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectDownloadHTTPService_HandleDownloadObject_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/download?key=report.txt", nil)
	req = withBucketParam(req, "test-bucket")
	rr := httptest.NewRecorder()

	newObjectDownloadHTTPService(srv).handleDownloadObject(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
}

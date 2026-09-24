package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/metrics"
	"s3desk/internal/models"
)

func TestHandleListObjectsBoundsLegacyCursorRescan(t *testing.T) {
	lockTestEnv(t)
	entries := strings.Repeat(`{"Path":"object.txt","Size":1},`, maxRcloneListCursorScanEntries) + `{"Path":"last.txt","Size":1}`
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) == 0 || args[0] != "lsjson" {
			t.Fatalf("unexpected rclone args: %v", args)
		}
		if !strings.Contains(strings.Join(args, " "), "--use-server-modtime") {
			t.Fatalf("fallback list should use provider LastModified without per-object metadata reads: %v", args)
		}
		return "[" + entries + "]", "", nil
	})

	apiMetrics := metrics.New()
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}, metrics: apiMetrics}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/bucket/objects?continuationToken=o%3Amissing", nil)
	req = withBucketParam(req, "bucket")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs})
	rr := httptest.NewRecorder()
	srv.handleListObjects(rr, req)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d body=%s, want bounded-cursor error", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "listing_cursor_too_deep") {
		t.Fatalf("body=%s, want listing_cursor_too_deep", rr.Body.String())
	}
	metricsResponse := httptest.NewRecorder()
	apiMetrics.Handler().ServeHTTP(metricsResponse, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if !strings.Contains(metricsResponse.Body.String(), `storage_rclone_list_entries_scanned_total{operation="list_objects_continuation",provider="gcp_gcs"} 100000`) {
		t.Fatalf("metrics missing scan count: %s", metricsResponse.Body.String())
	}
}

package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestObjectMetaHTTPService_HandleGetObjectMeta_ReturnsMissingProfile(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/test-bucket/objects/meta?key=report.txt", nil)
	req = withBucketParam(req, "test-bucket")
	rr := httptest.NewRecorder()

	newObjectMetaHTTPService(srv).handleGetObjectMeta(rr, req)

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

func TestBuildObjectMetaFromEntry_SetsDirectoryContentType(t *testing.T) {
	meta := buildObjectMetaFromEntry("folder/", rcloneListEntry{IsDir: true})
	if meta.ContentType != "application/x-directory" {
		t.Fatalf("contentType=%q, want application/x-directory", meta.ContentType)
	}
}

func TestObjectMetaKeyDecodesOnce(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/objects/meta?key=%E6%97%A5%E6%9C%AC%E8%AA%9E%2Fthe%2Bwinning+ticket%252F1080.mp4", nil)
	req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3}), "demo")
	metric := srv.beginStorageMetric("aws_s3", "get_object_meta")
	_, bucket, key, err := newObjectMetaHTTPService(srv).prepareGetObjectMeta(metric, req)
	if err != nil || bucket != "demo" || key != "日本語/the+winning ticket%2F1080.mp4" {
		t.Fatalf("bucket=%q key=%q err=%v", bucket, key, err)
	}
}

func TestRcloneStatRejectsNullInsteadOfZeroByteMetadata(t *testing.T) {
	restore := setAPIProcessTestHooks(apiProcessTestHooks{
		runRcloneCapture: func(_ *server, _ context.Context, _ models.ProfileSecrets, args []string, _ string) (string, string, error) {
			if args[len(args)-1] != "remote:demo/the+winning+ticket+1080.mp4" {
				t.Fatalf("target changed: %v", args)
			}
			return "null", "", nil
		},
	})
	defer restore()
	_, _, err := (&server{}).rcloneStat(t.Context(), models.ProfileSecrets{}, "remote:demo/the+winning+ticket+1080.mp4", true, true, "object-meta")
	if err == nil || !strings.Contains(err.Error(), "received null") {
		t.Fatalf("expected invalid stat response, got %v", err)
	}
}

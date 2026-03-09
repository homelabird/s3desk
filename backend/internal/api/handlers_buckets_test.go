package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestHandleBucketCRUDGcpRequiresProjectNumber(t *testing.T) {
	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	profile := models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs}

	tests := []struct {
		name        string
		method      string
		path        string
		body        []byte
		prepare     func(*http.Request) *http.Request
		wantMessage string
	}{
		{
			name:        "list buckets",
			method:      http.MethodGet,
			path:        "/api/v1/buckets",
			wantMessage: "gcp projectNumber is required to list buckets",
		},
		{
			name:        "create bucket",
			method:      http.MethodPost,
			path:        "/api/v1/buckets",
			body:        []byte(`{"name":"demo"}`),
			wantMessage: "gcp projectNumber is required to create buckets",
		},
		{
			name:   "delete bucket",
			method: http.MethodDelete,
			path:   "/api/v1/buckets/demo",
			prepare: func(req *http.Request) *http.Request {
				return withBucketParam(req, "demo")
			},
			wantMessage: "gcp projectNumber is required to delete buckets",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, bytes.NewReader(tc.body))
			if len(tc.body) > 0 {
				req.Header.Set("Content-Type", "application/json")
			}
			req = withProfileSecrets(req, profile)
			if tc.prepare != nil {
				req = tc.prepare(req)
			}
			rr := httptest.NewRecorder()

			switch tc.method {
			case http.MethodGet:
				srv.handleListBuckets(rr, req)
			case http.MethodPost:
				srv.handleCreateBucket(rr, req)
			case http.MethodDelete:
				srv.handleDeleteBucket(rr, req)
			default:
				t.Fatalf("unsupported method %s", tc.method)
			}

			res := rr.Result()
			defer res.Body.Close()
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
			}
			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != "invalid_config" {
				t.Fatalf("code=%q, want invalid_config", errResp.Error.Code)
			}
			if errResp.Error.Message != tc.wantMessage {
				t.Fatalf("message=%q, want %q", errResp.Error.Message, tc.wantMessage)
			}
			if got := errResp.Error.Details["field"]; got != "projectNumber" {
				t.Fatalf("field=%v, want projectNumber", got)
			}
		})
	}
}

func TestHandleListBucketsMapsAccessDenied(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeRclone(t, `
cmd=''
for arg in "$@"; do
  if [ "$arg" = "lsjson" ]; then cmd='lsjson'; fi
done
if [ "$cmd" = "lsjson" ]; then
  echo "AccessDenied: Access Denied" >&2
  exit 9
fi
exit 0
`))

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{
		Provider:              models.ProfileProviderS3Compatible,
		Endpoint:              "http://127.0.0.1:9000",
		Region:                "us-east-1",
		AccessKeyID:           "access",
		SecretAccessKey:       "secret",
		ForcePathStyle:        true,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	rr := httptest.NewRecorder()

	srv.handleListBuckets(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusForbidden)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "access_denied" {
		t.Fatalf("code=%q, want access_denied", errResp.Error.Code)
	}
	if errResp.Error.NormalizedError == nil || errResp.Error.NormalizedError.Code != models.NormalizedErrorAccessDenied {
		t.Fatalf("normalizedError=%+v, want access_denied", errResp.Error.NormalizedError)
	}
}

func TestHandleDeleteBucketMapsBucketNotEmpty(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeRclone(t, `
cmd=''
for arg in "$@"; do
  if [ "$arg" = "rmdir" ]; then cmd='rmdir'; fi
done
if [ "$cmd" = "rmdir" ]; then
  echo "Bucket not empty" >&2
  exit 9
fi
exit 0
`))

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/demo", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{
		Provider:              models.ProfileProviderS3Compatible,
		Endpoint:              "http://127.0.0.1:9000",
		Region:                "us-east-1",
		AccessKeyID:           "access",
		SecretAccessKey:       "secret",
		ForcePathStyle:        true,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleDeleteBucket(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusConflict)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "bucket_not_empty" {
		t.Fatalf("code=%q, want bucket_not_empty", errResp.Error.Code)
	}
	if got := errResp.Error.Details["bucket"]; got != "demo" {
		t.Fatalf("bucket=%v, want demo", got)
	}
}

func TestHandleDeleteBucketMapsNotFound(t *testing.T) {
	lockTestEnv(t)
	t.Setenv("RCLONE_PATH", writeFakeRclone(t, `
cmd=''
for arg in "$@"; do
  if [ "$arg" = "rmdir" ]; then cmd='rmdir'; fi
done
if [ "$cmd" = "rmdir" ]; then
  echo "NoSuchBucket: bucket not found" >&2
  exit 9
fi
exit 0
`))

	srv := &server{cfg: config.Config{DataDir: t.TempDir()}}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/buckets/demo", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{
		Provider:              models.ProfileProviderS3Compatible,
		Endpoint:              "http://127.0.0.1:9000",
		Region:                "us-east-1",
		AccessKeyID:           "access",
		SecretAccessKey:       "secret",
		ForcePathStyle:        true,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleDeleteBucket(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNotFound)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "not_found" {
		t.Fatalf("code=%q, want not_found", errResp.Error.Code)
	}
	if got := errResp.Error.Details["bucket"]; got != "demo" {
		t.Fatalf("bucket=%v, want demo", got)
	}
}

func withProfileSecrets(req *http.Request, profile models.ProfileSecrets) *http.Request {
	ctx := context.WithValue(req.Context(), profileSecretsKey, profile)
	return req.WithContext(ctx)
}

func withBucketParam(req *http.Request, bucket string) *http.Request {
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("bucket", bucket)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
	return req.WithContext(ctx)
}

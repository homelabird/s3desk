package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestDeleteObjectsRejectsUnsupportedControlCharacters(t *testing.T) {
	st, srv := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)

	req := models.DeleteObjectsRequest{Keys: []string{"good.txt", "bad\nkey"}}
	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/buckets/mybucket/objects", profile.ID, req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", res.StatusCode)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %q", errResp.Error.Code)
	}
	if !strings.Contains(errResp.Error.Message, "unsupported control characters") {
		t.Fatalf("expected control character error, got %q", errResp.Error.Message)
	}
}

func TestDeleteObjectsClassifiesS3MarkerProviderError(t *testing.T) {
	lockTestEnv(t)
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) > 0 && args[0] == "delete" {
			return "", "", nil
		}
		return "", "", fmt.Errorf("unexpected rclone args: %v", args)
	})

	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`<Error><Code>SlowDown</Code><Message>reduce your request rate</Message></Error>`))
	}))
	t.Cleanup(fakeS3.Close)

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfileWithEndpoint(t, st, fakeS3.URL)
	res := doJSONRequestWithProfile(t, srv, http.MethodDelete, "/api/v1/buckets/test-bucket/objects", profile.ID, models.DeleteObjectsRequest{Keys: []string{"folder/"}})
	defer res.Body.Close()
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status=%d, want 429", res.StatusCode)
	}
	if got := res.Header.Get("Retry-After"); got != "3" {
		t.Fatalf("Retry-After=%q, want 3", got)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "rate_limited" {
		t.Fatalf("error code=%q, want rate_limited", errResp.Error.Code)
	}
	if errResp.Error.NormalizedError == nil || errResp.Error.NormalizedError.Code != models.NormalizedErrorRateLimited || !errResp.Error.NormalizedError.Retryable {
		t.Fatalf("normalized error=%+v, want retryable rate_limited", errResp.Error.NormalizedError)
	}
}

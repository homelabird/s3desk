package api

import (
	"net/http"
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

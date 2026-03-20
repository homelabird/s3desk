package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestWriteErrorAddsNormalizedErrorForKnownCodes(t *testing.T) {
	rr := httptest.NewRecorder()
	writeError(rr, http.StatusTooManyRequests, "job_queue_full", "job queue is full; try again later", map[string]any{
		"queueDepth":    10,
		"queueCapacity": 256,
	})

	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusTooManyRequests)
	}
	if got := rr.Header().Get("Retry-After"); got != "3" {
		t.Fatalf("Retry-After=%q, want %q", got, "3")
	}

	var resp models.ErrorResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if resp.Error.Code != "job_queue_full" {
		t.Fatalf("error.code=%q, want %q", resp.Error.Code, "job_queue_full")
	}
	if resp.Error.NormalizedError == nil {
		t.Fatalf("expected normalizedError to be present")
	}
	if resp.Error.NormalizedError.Code != models.NormalizedErrorRateLimited {
		t.Fatalf("normalizedError.code=%q, want %q", resp.Error.NormalizedError.Code, models.NormalizedErrorRateLimited)
	}
	if !resp.Error.NormalizedError.Retryable {
		t.Fatalf("normalizedError.retryable=%v, want true", resp.Error.NormalizedError.Retryable)
	}
}

func TestWriteErrorPreservesRetryAfterHeader(t *testing.T) {
	rr := httptest.NewRecorder()
	rr.Header().Set("Retry-After", "2")

	writeError(rr, http.StatusTooManyRequests, "job_queue_full", "job queue is full; try again later", nil)

	if got := rr.Header().Get("Retry-After"); got != "2" {
		t.Fatalf("Retry-After=%q, want %q", got, "2")
	}
}

func TestWriteErrorLeavesUnknownCodeUnnormalized(t *testing.T) {
	rr := httptest.NewRecorder()
	writeError(rr, http.StatusBadRequest, "invalid_request", "bad request", nil)

	var resp models.ErrorResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if resp.Error.NormalizedError != nil {
		t.Fatalf("expected normalizedError to be nil for unknown mapping, got %+v", resp.Error.NormalizedError)
	}
}

func TestDecodeJSONRejectsTrailingValues(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "/api/v1/uploads", strings.NewReader(`{"bucket":"demo"}{"bucket":"extra"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	var payload struct {
		Bucket string `json:"bucket"`
	}
	err = decodeJSON(req, &payload)
	if !errors.Is(err, errJSONTrailingData) {
		t.Fatalf("decodeJSON() error=%v, want trailing-data rejection", err)
	}
}

func TestDecodeJSONWithOptionsRejectsOversizedBody(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "/api/v1/uploads", strings.NewReader(`{"bucket":"oversized"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	var payload struct {
		Bucket string `json:"bucket"`
	}
	err = decodeJSONWithOptions(req, &payload, jsonDecodeOptions{maxBytes: 8})
	if !errors.Is(err, errJSONBodyTooLarge) {
		t.Fatalf("decodeJSONWithOptions() error=%v, want body-too-large rejection", err)
	}
}

func TestDecodeJSONWithOptionsAllowsEmptyBody(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "/api/v1/uploads/upload-1/commit", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	var payload struct {
		Label string `json:"label"`
	}
	if err := decodeJSONWithOptions(req, &payload, jsonDecodeOptions{allowEmpty: true}); err != nil {
		t.Fatalf("decodeJSONWithOptions() unexpected error: %v", err)
	}
}

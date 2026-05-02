package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/models"
)

func TestProfileConnectivityHTTPService_PrepareProfileConnectivity_RequiresProfileID(t *testing.T) {
	t.Parallel()

	_, err := newProfileConnectivityHTTPService(&server{}).prepareProfileConnectivity(
		profileConnectivityTest,
		httptest.NewRequest(http.MethodPost, "/api/v1/profiles/test", nil),
	)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestProfileConnectivityHTTPService_HandleTestProfile_ReturnsInvalidRequestWithoutProfileID(t *testing.T) {
	t.Parallel()

	svc := newProfileConnectivityHTTPService(&server{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/profiles/test", nil)

	svc.handleTestProfile(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
}

func TestProfileConnectivityHTTPService_HandleBenchmarkProfile_ReturnsInvalidRequestWithoutProfileID(t *testing.T) {
	t.Parallel()

	svc := newProfileConnectivityHTTPService(&server{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/profiles/benchmark", nil)

	svc.handleBenchmarkProfile(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
}

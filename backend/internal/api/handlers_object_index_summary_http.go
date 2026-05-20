package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type objectIndexSummaryHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectIndexSummaryHTTPService struct {
	server *server
}

func (e *objectIndexSummaryHTTPError) Error() string {
	return e.message
}

func newObjectIndexSummaryHTTPService(s *server) objectIndexSummaryHTTPService {
	return objectIndexSummaryHTTPService{server: s}
}

func newObjectIndexSummaryHTTPError(status int, code, message string, details map[string]any) *objectIndexSummaryHTTPError {
	return &objectIndexSummaryHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectIndexSummaryHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc objectIndexSummaryHTTPService) prepareGetObjectIndexSummary(r *http.Request) (string, string, string, int, error) {
	profileID := strings.TrimSpace(r.Header.Get("X-Profile-Id"))
	if profileID == "" {
		return "", "", "", 0, newObjectIndexSummaryHTTPError(http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return "", "", "", 0, newObjectIndexSummaryHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	prefix := strings.TrimSpace(r.URL.Query().Get("prefix"))
	sampleLimit, err := parseIntQueryClamped(r, "sampleLimit", 10, 0, 100)
	if err != nil {
		return "", "", "", 0, newObjectIndexSummaryHTTPError(http.StatusBadRequest, "invalid_request", "sampleLimit is invalid", map[string]any{"sampleLimit": r.URL.Query().Get("sampleLimit")})
	}
	return profileID, bucket, prefix, sampleLimit, nil
}

func buildEmptyObjectIndexSummaryResponse(bucket string, prefix string) models.ObjectIndexSummaryResponse {
	return models.ObjectIndexSummaryResponse{
		Bucket:      bucket,
		Prefix:      strings.TrimPrefix(prefix, "/"),
		ObjectCount: 0,
		TotalBytes:  0,
		SampleKeys:  []string{},
	}
}

func (svc objectIndexSummaryHTTPService) executeGet(r *http.Request) (*models.ObjectIndexSummaryResponse, error) {
	profileID, bucket, prefix, sampleLimit, err := svc.prepareGetObjectIndexSummary(r)
	if err != nil {
		return nil, err
	}
	if svc.server.store == nil {
		return nil, newObjectIndexSummaryHTTPError(http.StatusInternalServerError, "internal_error", "store is not configured", nil)
	}

	resp, err := svc.server.store.SummarizeObjectIndex(r.Context(), profileID, store.SummarizeObjectIndexInput{
		Bucket:      bucket,
		Prefix:      prefix,
		SampleLimit: sampleLimit,
	})
	if err != nil {
		if errors.Is(err, store.ErrObjectIndexNotFound) {
			empty := buildEmptyObjectIndexSummaryResponse(bucket, prefix)
			return &empty, nil
		}
		return nil, newObjectIndexSummaryHTTPError(http.StatusInternalServerError, "internal_error", "failed to summarize object index", map[string]any{"error": err.Error()})
	}
	return &resp, nil
}

func (svc objectIndexSummaryHTTPService) handleGetObjectIndexSummary(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeGet(r)
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if httpErr, ok := err.(*objectIndexSummaryHTTPError); ok {
		respErr := buildObjectIndexSummaryHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildObjectIndexSummaryHTTPErrorResponse("internal_error", "failed to summarize object index", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

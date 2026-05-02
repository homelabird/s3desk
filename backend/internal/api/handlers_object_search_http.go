package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type objectSearchHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectSearchHTTPService struct {
	server *server
}

func (e *objectSearchHTTPError) Error() string {
	return e.message
}

func newObjectSearchHTTPService(s *server) objectSearchHTTPService {
	return objectSearchHTTPService{server: s}
}

func newObjectSearchHTTPError(status int, code, message string, details map[string]any) *objectSearchHTTPError {
	return &objectSearchHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectSearchHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc objectSearchHTTPService) prepareSearchObjects(r *http.Request) (string, store.SearchObjectIndexInput, error) {
	profileID := strings.TrimSpace(r.Header.Get("X-Profile-Id"))
	if profileID == "" {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(r.URL.Query().Get("query"))
	}
	if q == "" {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "invalid_request", "q is required", nil)
	}

	prefix := strings.TrimSpace(r.URL.Query().Get("prefix"))
	limit, _ := parseIntQueryClamped(r, "limit", 50, 1, 200)

	var cursor *string
	if raw := strings.TrimSpace(r.URL.Query().Get("cursor")); raw != "" {
		cursor = &raw
	}

	ext := strings.TrimSpace(r.URL.Query().Get("ext"))
	if ext == "" {
		ext = strings.TrimSpace(r.URL.Query().Get("extension"))
	}
	ext = strings.TrimPrefix(ext, ".")
	if strings.ContainsAny(ext, "/\\") {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "invalid_request", "ext is invalid", map[string]any{"ext": ext})
	}

	minSizePtr, err := parseSizeQueryParam(r, "minSize")
	if err != nil {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "invalid_request", "minSize is invalid", map[string]any{"minSize": r.URL.Query().Get("minSize")})
	}
	maxSizePtr, err := parseSizeQueryParam(r, "maxSize")
	if err != nil {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "invalid_request", "maxSize is invalid", map[string]any{"maxSize": r.URL.Query().Get("maxSize")})
	}
	if minSizePtr != nil && maxSizePtr != nil && *minSizePtr > *maxSizePtr {
		minSizePtr, maxSizePtr = maxSizePtr, minSizePtr
	}

	modifiedAfter, err := parseTimeQueryParam(r, "modifiedAfter")
	if err != nil {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "invalid_request", "modifiedAfter is invalid", map[string]any{"modifiedAfter": r.URL.Query().Get("modifiedAfter")})
	}
	modifiedBefore, err := parseTimeQueryParam(r, "modifiedBefore")
	if err != nil {
		return "", store.SearchObjectIndexInput{}, newObjectSearchHTTPError(http.StatusBadRequest, "invalid_request", "modifiedBefore is invalid", map[string]any{"modifiedBefore": r.URL.Query().Get("modifiedBefore")})
	}
	if modifiedAfter != "" && modifiedBefore != "" && modifiedAfter > modifiedBefore {
		modifiedAfter, modifiedBefore = modifiedBefore, modifiedAfter
	}

	return profileID, store.SearchObjectIndexInput{
		Bucket:         bucket,
		Query:          q,
		Prefix:         prefix,
		Limit:          limit,
		Cursor:         cursor,
		Extension:      ext,
		MinSize:        minSizePtr,
		MaxSize:        maxSizePtr,
		ModifiedAfter:  modifiedAfter,
		ModifiedBefore: modifiedBefore,
	}, nil
}

func (svc objectSearchHTTPService) executeGet(r *http.Request) (*models.SearchObjectsResponse, error) {
	profileID, input, err := svc.prepareSearchObjects(r)
	if err != nil {
		return nil, err
	}
	if svc.server.store == nil {
		return nil, newObjectSearchHTTPError(http.StatusInternalServerError, "internal_error", "store is not configured", nil)
	}

	resp, err := svc.server.store.SearchObjectIndex(r.Context(), profileID, input)
	if err != nil {
		if errors.Is(err, store.ErrObjectIndexNotFound) {
			return nil, newObjectSearchHTTPError(
				http.StatusConflict,
				"not_indexed",
				"object index is not available; create an s3_index_objects job first",
				map[string]any{"bucket": input.Bucket},
			)
		}
		return nil, newObjectSearchHTTPError(http.StatusInternalServerError, "internal_error", "failed to search object index", map[string]any{"error": err.Error()})
	}
	return &resp, nil
}

func (svc objectSearchHTTPService) handleSearchObjects(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeGet(r)
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if httpErr, ok := err.(*objectSearchHTTPError); ok {
		respErr := buildObjectSearchHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildObjectSearchHTTPErrorResponse("internal_error", "failed to search object index", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

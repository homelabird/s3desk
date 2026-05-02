package api

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type serverRestorePreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type serverRestoreHTTPService struct {
	server *server
}

func (e *serverRestorePreparationError) Error() string {
	return e.message
}

func newServerRestorePreparationError(status int, code, message string, details map[string]any) *serverRestorePreparationError {
	return &serverRestorePreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func buildServerRestoreHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{
		Error: models.APIError{
			Code:    code,
			Message: message,
			Details: details,
		},
	}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func newServerRestoreHTTPService(s *server) serverRestoreHTTPService {
	return serverRestoreHTTPService{server: s}
}

func (svc serverRestoreHTTPService) executeList() (*models.ServerStagedRestoreListResponse, error) {
	items, err := svc.server.listServerRestores()
	if err != nil {
		return nil, err
	}
	resp := models.ServerStagedRestoreListResponse{Items: items}
	return &resp, nil
}

func (svc serverRestoreHTTPService) prepareDeleteServerRestore(r *http.Request) (string, string, string, error) {
	restoreID := strings.TrimSpace(chi.URLParam(r, "restoreId"))
	if restoreID == "" {
		return "", "", "", newServerRestorePreparationError(
			http.StatusBadRequest,
			"invalid_request",
			"missing restore id",
			nil,
		)
	}

	restoreBase := filepath.Join(svc.server.cfg.DataDir, "restores")
	targetPath, err := resolveRestorePath(restoreBase, restoreID)
	if err != nil {
		return "", "", "", newServerRestorePreparationError(
			http.StatusBadRequest,
			"invalid_request",
			"invalid restore id",
			map[string]any{"error": err.Error()},
		)
	}
	if targetPath == filepath.Clean(restoreBase) {
		return "", "", "", newServerRestorePreparationError(
			http.StatusBadRequest,
			"invalid_request",
			"refusing to delete restore root",
			nil,
		)
	}

	return restoreID, restoreBase, targetPath, nil
}

func (svc serverRestoreHTTPService) executePreparedDelete(restoreID string, targetPath string, err error) error {
	if err != nil {
		return err
	}

	svc.server.restoreMu.Lock()
	defer svc.server.restoreMu.Unlock()

	info, err := os.Stat(targetPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return newServerRestorePreparationError(
				http.StatusNotFound,
				"not_found",
				"staged restore not found",
				map[string]any{"restoreId": restoreID},
			)
		}
		return newServerRestorePreparationError(
			http.StatusInternalServerError,
			"restore_delete_failed",
			"failed to stat staged restore",
			map[string]any{"error": err.Error()},
		)
	}
	if !info.IsDir() {
		return newServerRestorePreparationError(
			http.StatusBadRequest,
			"invalid_request",
			"restore target is not a directory",
			map[string]any{"restoreId": restoreID},
		)
	}
	if err := os.RemoveAll(targetPath); err != nil {
		return newServerRestorePreparationError(
			http.StatusInternalServerError,
			"restore_delete_failed",
			"failed to delete staged restore",
			map[string]any{"error": err.Error(), "restoreId": restoreID},
		)
	}
	return nil
}

func (svc serverRestoreHTTPService) executeDelete(r *http.Request) error {
	restoreID, _, targetPath, err := svc.prepareDeleteServerRestore(r)
	return svc.executePreparedDelete(restoreID, targetPath, err)
}

func (svc serverRestoreHTTPService) handleListServerRestores(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeList()
	if err != nil {
		if prepErr := (*serverRestorePreparationError)(nil); errors.As(err, &prepErr) {
			resp := buildServerRestoreHTTPErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, &resp)
			return
		}
		resp := buildServerRestoreHTTPErrorResponse(
			"restore_list_failed",
			"failed to list staged restores",
			map[string]any{"error": err.Error()},
		)
		writeJSON(w, http.StatusInternalServerError, &resp)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (svc serverRestoreHTTPService) handleDeleteServerRestore(w http.ResponseWriter, r *http.Request) {
	err := svc.executeDelete(r)
	if err != nil {
		if prepErr := (*serverRestorePreparationError)(nil); errors.As(err, &prepErr) {
			resp := buildServerRestoreHTTPErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, &resp)
			return
		}
		resp := buildServerRestoreHTTPErrorResponse(
			"restore_list_failed",
			"failed to list staged restores",
			map[string]any{"error": err.Error()},
		)
		writeJSON(w, http.StatusInternalServerError, &resp)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

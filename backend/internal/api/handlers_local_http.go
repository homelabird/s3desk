package api

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"s3desk/internal/localpath"
	"s3desk/internal/models"
)

type localEntriesPreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type localEntriesPreparedRequest struct {
	rootList bool
	basePath string
	realPath string
	limit    int
	err      error
}

type localEntriesHTTPService struct {
	server *server
}

func (e *localEntriesPreparationError) Error() string {
	return e.message
}

func newLocalEntriesPreparationError(status int, code, message string, details map[string]any) *localEntriesPreparationError {
	return &localEntriesPreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func buildLocalEntriesHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
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

func newLocalEntriesHTTPService(s *server) localEntriesHTTPService {
	return localEntriesHTTPService{server: s}
}

func parseLocalEntriesLimit(r *http.Request) (int, error) {
	limit := 2000
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		} else {
			return 0, err
		}
	}
	if limit < 1 {
		return 1, nil
	}
	if limit > 5000 {
		return 5000, nil
	}
	return limit, nil
}

func localEntryName(path string) string {
	base := filepath.Base(path)
	if base == "." || base == string(os.PathSeparator) || base == "" {
		return path
	}
	return base
}

func buildAllowedLocalRootEntries(allowedDirs []string) models.ListLocalEntriesResponse {
	entries := make([]models.LocalEntry, 0, len(allowedDirs))
	for _, dir := range allowedDirs {
		entries = append(entries, models.LocalEntry{
			Name:  localEntryName(dir),
			Path:  dir,
			IsDir: true,
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Path) < strings.ToLower(entries[j].Path)
	})
	return models.ListLocalEntriesResponse{Entries: entries}
}

func listAllowedLocalDirectoryEntries(real string, allowedDirs []string, limit int) ([]models.LocalEntry, error) {
	dirEntries, err := os.ReadDir(real)
	if err != nil {
		return nil, err
	}

	entries := make([]models.LocalEntry, 0, len(dirEntries))
	for _, ent := range dirEntries {
		if len(entries) >= limit {
			break
		}
		name := ent.Name()
		if name == "" {
			continue
		}
		if ent.Type()&os.ModeSymlink != 0 {
			continue
		}

		isDir := ent.IsDir()
		full := filepath.Join(real, name)
		if !isDir {
			continue
		}

		childReal := full
		if resolved, err := filepath.EvalSymlinks(full); err == nil {
			childReal = resolved
		}
		childAllowed := false
		for _, dir := range allowedDirs {
			if isUnderDir(dir, childReal) {
				childAllowed = true
				break
			}
		}
		if !childAllowed {
			continue
		}

		entries = append(entries, models.LocalEntry{Name: name, Path: full, IsDir: true})
	}

	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	return entries, nil
}

func (svc localEntriesHTTPService) prepareListLocalEntries(r *http.Request) localEntriesPreparedRequest {
	if len(svc.server.cfg.AllowedLocalDirs) == 0 {
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"not_configured",
				"ALLOWED_LOCAL_DIRS is not configured on the server",
				nil,
			),
		}
	}

	base := strings.TrimSpace(r.URL.Query().Get("path"))
	if base == "" {
		limit, err := parseLocalEntriesLimit(r)
		if err != nil {
			return localEntriesPreparedRequest{
				err: newLocalEntriesPreparationError(
					http.StatusBadRequest,
					"invalid_request",
					"limit is invalid",
					map[string]any{"limit": r.URL.Query().Get("limit")},
				),
			}
		}
		return localEntriesPreparedRequest{
			rootList: true,
			limit:    limit,
		}
	}

	clean := filepath.Clean(base)
	if clean == "." || clean == "" {
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"path is invalid",
				map[string]any{"path": base},
			),
		}
	}

	abs, err := filepath.Abs(clean)
	if err != nil {
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"path is invalid",
				map[string]any{"path": base, "error": err.Error()},
			),
		}
	}

	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return localEntriesPreparedRequest{
				err: newLocalEntriesPreparationError(
					http.StatusNotFound,
					"not_found",
					"path not found",
					map[string]any{"path": abs},
				),
			}
		}
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"path is invalid",
				map[string]any{"path": abs, "error": err.Error()},
			),
		}
	}

	info, err := os.Stat(real)
	if err != nil {
		if os.IsNotExist(err) {
			return localEntriesPreparedRequest{
				err: newLocalEntriesPreparationError(
					http.StatusNotFound,
					"not_found",
					"path not found",
					map[string]any{"path": real},
				),
			}
		}
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"path is invalid",
				map[string]any{"path": real, "error": err.Error()},
			),
		}
	}
	if !info.IsDir() {
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"path must be a directory",
				map[string]any{"path": real},
			),
		}
	}

	allowed := false
	for _, dir := range svc.server.cfg.AllowedLocalDirs {
		if isUnderDir(dir, real) {
			allowed = true
			break
		}
	}
	if !allowed {
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusForbidden,
				"forbidden",
				"path is not under an allowed local directory",
				map[string]any{"path": real, "allowedRoots": svc.server.cfg.AllowedLocalDirs},
			),
		}
	}
	if err := localpath.RejectSymlinkComponentsUnderRoots(abs, svc.server.cfg.AllowedLocalDirs); err != nil {
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"path is invalid",
				map[string]any{"path": abs, "error": err.Error()},
			),
		}
	}

	limit, err := parseLocalEntriesLimit(r)
	if err != nil {
		return localEntriesPreparedRequest{
			err: newLocalEntriesPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"limit is invalid",
				map[string]any{"limit": r.URL.Query().Get("limit")},
			),
		}
	}

	return localEntriesPreparedRequest{
		basePath: base,
		realPath: real,
		limit:    limit,
	}
}

func (svc localEntriesHTTPService) executePrepared(prepared localEntriesPreparedRequest) (*models.ListLocalEntriesResponse, error) {
	if prepared.err != nil {
		return nil, prepared.err
	}

	if prepared.rootList {
		resp := buildAllowedLocalRootEntries(svc.server.cfg.AllowedLocalDirs)
		return &resp, nil
	}

	entries, err := listAllowedLocalDirectoryEntries(prepared.realPath, svc.server.cfg.AllowedLocalDirs, prepared.limit)
	if err != nil {
		return nil, newLocalEntriesPreparationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to read directory",
			map[string]any{"error": err.Error()},
		)
	}

	resp := models.ListLocalEntriesResponse{
		BasePath: prepared.realPath,
		Entries:  entries,
	}
	return &resp, nil
}

func (svc localEntriesHTTPService) executeList(r *http.Request) (*models.ListLocalEntriesResponse, error) {
	return svc.executePrepared(svc.prepareListLocalEntries(r))
}

func (svc localEntriesHTTPService) handleListLocalEntries(w http.ResponseWriter, r *http.Request) {
	resp, err := svc.executeList(r)
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var prepErr *localEntriesPreparationError
	if errors.As(err, &prepErr) {
		resp := buildLocalEntriesHTTPErrorResponse(prepErr.code, prepErr.message, prepErr.details)
		writeJSON(w, prepErr.status, resp)
		return
	}

	respErr := buildLocalEntriesHTTPErrorResponse(
		"internal_error",
		"failed to list local entries",
		map[string]any{"error": err.Error()},
	)
	writeJSON(w, http.StatusInternalServerError, respErr)
}

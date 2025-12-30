package api

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"s3desk/internal/models"
)

func (s *server) handleListLocalEntries(w http.ResponseWriter, r *http.Request) {
	if len(s.cfg.AllowedLocalDirs) == 0 {
		writeError(w, http.StatusBadRequest, "not_configured", "ALLOWED_LOCAL_DIRS is not configured on the server", nil)
		return
	}

	base := strings.TrimSpace(r.URL.Query().Get("path"))

	limit := 2000
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 5000 {
		limit = 5000
	}

	if base == "" {
		entries := make([]models.LocalEntry, 0, len(s.cfg.AllowedLocalDirs))
		for _, dir := range s.cfg.AllowedLocalDirs {
			entries = append(entries, models.LocalEntry{
				Name:  localEntryName(dir),
				Path:  dir,
				IsDir: true,
			})
		}
		sort.Slice(entries, func(i, j int) bool { return strings.ToLower(entries[i].Path) < strings.ToLower(entries[j].Path) })
		writeJSON(w, http.StatusOK, models.ListLocalEntriesResponse{Entries: entries})
		return
	}

	clean := filepath.Clean(base)
	if clean == "." || clean == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "path is invalid", map[string]any{"path": base})
		return
	}

	abs, err := filepath.Abs(clean)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "path is invalid", map[string]any{"path": base, "error": err.Error()})
		return
	}

	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "not_found", "path not found", map[string]any{"path": abs})
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_request", "path is invalid", map[string]any{"path": abs, "error": err.Error()})
		return
	}

	info, err := os.Stat(real)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "not_found", "path not found", map[string]any{"path": real})
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_request", "path is invalid", map[string]any{"path": real, "error": err.Error()})
		return
	}
	if !info.IsDir() {
		writeError(w, http.StatusBadRequest, "invalid_request", "path must be a directory", map[string]any{"path": real})
		return
	}

	allowed := false
	for _, dir := range s.cfg.AllowedLocalDirs {
		if isUnderDir(dir, real) {
			allowed = true
			break
		}
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "forbidden", "path is not under an allowed local directory", map[string]any{"path": real, "allowedRoots": s.cfg.AllowedLocalDirs})
		return
	}

	dirEntries, err := os.ReadDir(real)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to read directory", map[string]any{"error": err.Error()})
		return
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

		isDir := ent.IsDir()
		full := filepath.Join(real, name)
		if !isDir && ent.Type()&os.ModeSymlink != 0 {
			if st, err := os.Stat(full); err == nil && st.IsDir() {
				isDir = true
			}
		}
		if !isDir {
			continue
		}

		childReal := full
		if resolved, err := filepath.EvalSymlinks(full); err == nil {
			childReal = resolved
		}
		childAllowed := false
		for _, dir := range s.cfg.AllowedLocalDirs {
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

	sort.Slice(entries, func(i, j int) bool { return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name) })
	writeJSON(w, http.StatusOK, models.ListLocalEntriesResponse{BasePath: real, Entries: entries})
}

func localEntryName(path string) string {
	base := filepath.Base(path)
	if base == "." || base == string(os.PathSeparator) || base == "" {
		return path
	}
	return base
}


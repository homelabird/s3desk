package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

func (s *server) handleListServerRestores(w http.ResponseWriter, r *http.Request) {
	items, err := s.listServerRestores()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "restore_list_failed", "failed to list staged restores", map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.ServerStagedRestoreListResponse{Items: items})
}

func (s *server) handleDeleteServerRestore(w http.ResponseWriter, r *http.Request) {
	s.restoreMu.Lock()
	defer s.restoreMu.Unlock()

	restoreID := strings.TrimSpace(chi.URLParam(r, "restoreId"))
	if restoreID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "missing restore id", nil)
		return
	}

	restoreBase := filepath.Join(s.cfg.DataDir, "restores")
	targetPath, err := resolveRestorePath(restoreBase, restoreID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid restore id", map[string]any{"error": err.Error()})
		return
	}
	if targetPath == filepath.Clean(restoreBase) {
		writeError(w, http.StatusBadRequest, "invalid_request", "refusing to delete restore root", nil)
		return
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(w, http.StatusNotFound, "not_found", "staged restore not found", map[string]any{"restoreId": restoreID})
			return
		}
		writeError(w, http.StatusInternalServerError, "restore_delete_failed", "failed to stat staged restore", map[string]any{"error": err.Error()})
		return
	}
	if !info.IsDir() {
		writeError(w, http.StatusBadRequest, "invalid_request", "restore target is not a directory", map[string]any{"restoreId": restoreID})
		return
	}
	if err := os.RemoveAll(targetPath); err != nil {
		writeError(w, http.StatusInternalServerError, "restore_delete_failed", "failed to delete staged restore", map[string]any{"error": err.Error(), "restoreId": restoreID})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) listServerRestores() ([]models.ServerStagedRestore, error) {
	s.restoreMu.RLock()
	defer s.restoreMu.RUnlock()

	restoreBase := filepath.Join(s.cfg.DataDir, "restores")
	entries, err := os.ReadDir(restoreBase)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []models.ServerStagedRestore{}, nil
		}
		return nil, err
	}

	items := make([]models.ServerStagedRestore, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		restoreID := entry.Name()
		restoreDir := filepath.Join(restoreBase, restoreID)
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}

		item := models.ServerStagedRestore{
			ID:         restoreID,
			StagingDir: restoreDir,
			StagedAt:   info.ModTime().UTC().Format(time.RFC3339),
		}

		manifestPath := filepath.Join(restoreDir, "manifest.json")
		// #nosec G304 -- manifestPath is derived from a directory returned by os.ReadDir under the restore root.
		data, err := os.ReadFile(manifestPath)
		if err == nil {
			var manifest models.ServerMigrationManifest
			if json.Unmarshal(data, &manifest) == nil {
				if manifest.BundleKind == "" {
					manifest.BundleKind = serverBackupScopeFull
				}
				item.Manifest = &manifest
			}
		}

		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].StagedAt > items[j].StagedAt
	})
	return items, nil
}

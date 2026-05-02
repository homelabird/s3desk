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

	"s3desk/internal/models"
)

func (s *server) handleListServerRestores(w http.ResponseWriter, r *http.Request) {
	newServerRestoreHTTPService(s).handleListServerRestores(w, r)
}

func (s *server) handleDeleteServerRestore(w http.ResponseWriter, r *http.Request) {
	newServerRestoreHTTPService(s).handleDeleteServerRestore(w, r)
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

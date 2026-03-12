package store

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func UploadStagingRoot(dataDir string) string {
	return filepath.Clean(filepath.Join(dataDir, "staging"))
}

func ResolveUploadStagingDir(dataDir, uploadID string) (string, error) {
	uploadID = strings.TrimSpace(uploadID)
	if uploadID == "" {
		return "", fmt.Errorf("upload session id is required")
	}
	if uploadID == "." || uploadID == ".." || strings.ContainsAny(uploadID, `/\`) {
		return "", fmt.Errorf("upload session id %q is invalid", uploadID)
	}

	root := UploadStagingRoot(dataDir)
	target := filepath.Clean(filepath.Join(root, uploadID))
	if !pathIsUnderDir(root, target) {
		return "", fmt.Errorf("upload staging dir escapes staging root")
	}
	return target, nil
}

func pathIsUnderDir(dir, target string) bool {
	rel, err := filepath.Rel(dir, target)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return false
	}
	return true
}

package localpath

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type SymlinkComponentError struct {
	Path string
}

func (e *SymlinkComponentError) Error() string {
	return fmt.Sprintf("symlinked local paths are not allowed: %q", e.Path)
}

func IsUnderDir(dir, target string) bool {
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

func RejectSymlinkComponentsUnderRoots(path string, roots []string) error {
	if len(roots) == 0 {
		return nil
	}
	abs, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return err
	}

	for _, root := range roots {
		root = filepath.Clean(root)
		if root == "" || root == "." {
			continue
		}
		rootAbs, err := filepath.Abs(root)
		if err != nil {
			return err
		}
		if !IsUnderDir(rootAbs, abs) {
			continue
		}
		if err := rejectSymlinkComponentsBelowRoot(rootAbs, abs); err != nil {
			return err
		}
	}
	return nil
}

func rejectSymlinkComponentsBelowRoot(root, path string) error {
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == "." {
		return err
	}
	current := root
	for _, part := range strings.Split(rel, string(os.PathSeparator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)
		// Lstat rejects symlink escapes without following links; a missing leaf remains creatable.
		info, err := os.Lstat(current)
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return &SymlinkComponentError{Path: current}
		}
	}
	return nil
}

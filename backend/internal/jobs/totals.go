package jobs

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type localTotals struct {
	Objects int64
	Bytes   int64
}

func computeLocalTotals(ctx context.Context, root string, include, exclude []string) (localTotals, error) {
	info, err := os.Stat(root)
	if err != nil {
		return localTotals{}, err
	}
	if info.Mode().IsRegular() {
		name := filepath.Base(root)
		if !shouldIncludePath(name, include, exclude) {
			return localTotals{}, nil
		}
		return localTotals{Objects: 1, Bytes: info.Size()}, nil
	}
	if !info.IsDir() {
		return localTotals{}, nil
	}

	var totals localTotals
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if rel == "." || rel == "" {
			rel = filepath.ToSlash(filepath.Base(path))
		}

		if !shouldIncludePath(rel, include, exclude) {
			return nil
		}

		totals.Objects++
		totals.Bytes += info.Size()
		return nil
	})
	if err != nil {
		return localTotals{}, err
	}
	return totals, nil
}

func shouldIncludePath(path string, include, exclude []string) bool {
	normalized := strings.TrimPrefix(filepath.ToSlash(path), "/")

	included := true
	if len(include) > 0 {
		included = false
		for _, pat := range include {
			pat = strings.TrimSpace(pat)
			if pat == "" {
				continue
			}
			if wildcardMatch(filepath.ToSlash(pat), normalized) {
				included = true
				break
			}
		}
	}
	if !included {
		return false
	}
	for _, pat := range exclude {
		pat = strings.TrimSpace(pat)
		if pat == "" {
			continue
		}
		if wildcardMatch(filepath.ToSlash(pat), normalized) {
			return false
		}
	}
	return true
}

// wildcardMatch matches `*` and `?` with `*` spanning path separators.
func wildcardMatch(pattern, s string) bool {
	p := pattern
	str := s

	pi := 0
	si := 0
	star := -1
	match := 0

	for si < len(str) {
		if pi < len(p) && (p[pi] == '?' || p[pi] == str[si]) {
			pi++
			si++
			continue
		}
		if pi < len(p) && p[pi] == '*' {
			star = pi
			match = si
			pi++
			continue
		}
		if star != -1 {
			pi = star + 1
			match++
			si = match
			continue
		}
		return false
	}

	for pi < len(p) && p[pi] == '*' {
		pi++
	}
	return pi == len(p)
}

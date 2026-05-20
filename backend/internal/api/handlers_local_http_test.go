package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestExecuteList_UsesPreparedListExecution(t *testing.T) {
	t.Parallel()

	parent := t.TempDir()
	root := filepath.Join(parent, "root")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("mkdir root: %v", err)
	}

	svc := newLocalEntriesHTTPService(&server{
		cfg: config.Config{AllowedLocalDirs: []string{root}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/local/entries", nil)

	resp, err := svc.executeList(req)
	if err != nil {
		t.Fatalf("err=%v, want nil", err)
	}
	if resp == nil {
		t.Fatal("expected response")
	}
	if resp.BasePath != "" {
		t.Fatalf("resp.BasePath=%q, want empty base path for root listing", resp.BasePath)
	}
}

func TestLocalEntriesHTTPService_HandleListLocalEntries_ReturnsAllowedRootsSorted(t *testing.T) {
	t.Parallel()

	parent := t.TempDir()
	rootB := filepath.Join(parent, "b-root")
	rootA := filepath.Join(parent, "a-root")
	if err := os.MkdirAll(rootA, 0o755); err != nil {
		t.Fatalf("mkdir rootA: %v", err)
	}
	if err := os.MkdirAll(rootB, 0o755); err != nil {
		t.Fatalf("mkdir rootB: %v", err)
	}

	svc := newLocalEntriesHTTPService(&server{
		cfg: config.Config{AllowedLocalDirs: []string{rootB, rootA}},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/local/entries", nil)

	svc.handleListLocalEntries(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}

	var resp models.ListLocalEntriesResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Entries) != 2 {
		t.Fatalf("len(resp.Entries)=%d, want 2", len(resp.Entries))
	}
	if resp.Entries[0].Path != rootA || resp.Entries[1].Path != rootB {
		t.Fatalf("resp.Entries=%#v, want sorted roots", resp.Entries)
	}
}

func TestLocalEntriesHTTPService_HandleListLocalEntries_ReturnsAllowedDirectoryChildrenOnly(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	insideB := filepath.Join(root, "b-child")
	insideA := filepath.Join(root, "a-child")
	fileOnly := filepath.Join(root, "skip.txt")
	outside := t.TempDir()
	outsideDir := filepath.Join(outside, "outside-child")
	outsideLink := filepath.Join(root, "outside-link")
	insideLink := filepath.Join(root, "inside-link")

	for _, dir := range []string{insideA, insideB, outsideDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", dir, err)
		}
	}
	if err := os.WriteFile(fileOnly, []byte("demo"), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if err := os.Symlink(outsideDir, outsideLink); err != nil {
		t.Fatalf("symlink outside dir: %v", err)
	}
	if err := os.Symlink(insideA, insideLink); err != nil {
		t.Fatalf("symlink inside dir: %v", err)
	}

	svc := newLocalEntriesHTTPService(&server{
		cfg: config.Config{AllowedLocalDirs: []string{root}},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/local/entries?path="+root+"&limit=10", nil)

	svc.handleListLocalEntries(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}

	var resp models.ListLocalEntriesResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.BasePath != root {
		t.Fatalf("resp.BasePath=%q, want %q", resp.BasePath, root)
	}
	if len(resp.Entries) != 2 {
		t.Fatalf("len(resp.Entries)=%d, want 2", len(resp.Entries))
	}
	if resp.Entries[0].Name != "a-child" || resp.Entries[1].Name != "b-child" {
		t.Fatalf("resp.Entries=%#v, want sorted allowed directories only", resp.Entries)
	}
}

func TestLocalEntriesHTTPService_HandleListLocalEntries_ReturnsNotConfiguredError(t *testing.T) {
	t.Parallel()

	svc := newLocalEntriesHTTPService(&server{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/local/entries", nil)

	svc.handleListLocalEntries(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "not_configured" {
		t.Fatalf("resp.Error.Code=%q, want not_configured", resp.Error.Code)
	}
}

func TestLocalEntriesHTTPService_HandleListLocalEntries_ReturnsInvalidLimit(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	svc := newLocalEntriesHTTPService(&server{
		cfg: config.Config{AllowedLocalDirs: []string{root}},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/local/entries?path="+root+"&limit=abc", nil)

	svc.handleListLocalEntries(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
	if got := resp.Error.Details["limit"]; got != "abc" {
		t.Fatalf("details.limit=%v, want abc", got)
	}
}

func TestLocalEntriesHTTPService_HandleListLocalEntries_RejectsSymlinkPathInsideAllowedRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatalf("mkdir target: %v", err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(target, link); err != nil {
		t.Fatalf("symlink target: %v", err)
	}

	svc := newLocalEntriesHTTPService(&server{
		cfg: config.Config{AllowedLocalDirs: []string{root}},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/local/entries?path="+link, nil)

	svc.handleListLocalEntries(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_request" {
		t.Fatalf("resp.Error.Code=%q, want invalid_request", resp.Error.Code)
	}
}

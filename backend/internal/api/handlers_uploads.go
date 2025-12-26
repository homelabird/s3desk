package api

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"object-storage/internal/jobs"
	"object-storage/internal/models"
	"object-storage/internal/store"
	"object-storage/internal/ws"
)

func (s *server) handleCreateUpload(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	var req models.UploadCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	req.Bucket = strings.TrimSpace(req.Bucket)
	req.Prefix = strings.TrimSpace(req.Prefix)
	if req.Bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	expiresAt := time.Now().UTC().Add(s.cfg.UploadSessionTTL).Format(time.RFC3339Nano)
	stagingBase := filepath.Join(s.cfg.DataDir, "staging")

	us, err := s.store.CreateUploadSession(r.Context(), profileID, req.Bucket, req.Prefix, "", expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create upload session", nil)
		return
	}

	stagingDir := filepath.Join(stagingBase, us.ID)
	if err := os.MkdirAll(stagingDir, 0o700); err != nil {
		_, _ = s.store.DeleteUploadSession(r.Context(), profileID, us.ID)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create staging directory", nil)
		return
	}

	if err := s.store.SetUploadSessionStagingDir(r.Context(), profileID, us.ID, stagingDir); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to finalize upload session", nil)
		return
	}

	var maxBytes *int64
	if s.cfg.UploadMaxBytes > 0 {
		v := s.cfg.UploadMaxBytes
		maxBytes = &v
	}

	writeJSON(w, http.StatusCreated, models.UploadCreateResponse{
		UploadID:  us.ID,
		MaxBytes:  maxBytes,
		ExpiresAt: expiresAt,
	})
}

func (s *server) handleUploadFiles(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := chi.URLParam(r, "uploadId")
	if profileID == "" || uploadID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and uploadId are required", nil)
		return
	}

	us, ok, err := s.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load upload session", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "upload session not found", map[string]any{"uploadId": uploadID})
		return
	}
	if us.StagingDir == "" {
		writeError(w, http.StatusInternalServerError, "internal_error", "upload session is missing staging directory", nil)
		return
	}

	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil {
		if time.Now().UTC().After(expiresAt) {
			writeError(w, http.StatusBadRequest, "expired", "upload session expired", nil)
			return
		}
	}

	reader, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "expected multipart/form-data", map[string]any{"error": err.Error()})
		return
	}

	maxBytes := s.cfg.UploadMaxBytes
	remainingBytes := int64(-1)
	if maxBytes > 0 {
		current, err := dirSize(us.StagingDir)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to check upload size", map[string]any{"error": err.Error()})
			return
		}
		remainingBytes = maxBytes - current
		if remainingBytes <= 0 {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload session exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
			return
		}
	}

	written := 0
	skipped := 0
	for {
		part, err := reader.NextPart()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			writeError(w, http.StatusBadRequest, "invalid_multipart", "failed to read multipart body", map[string]any{"error": err.Error()})
			return
		}
		if part.FormName() != "files" {
			_ = part.Close()
			continue
		}

		relPath := safeUploadPath(part)
		if relPath == "" {
			skipped++
			_ = part.Close()
			continue
		}

		relOS := filepath.FromSlash(relPath)
		dstDir := filepath.Join(us.StagingDir, filepath.Dir(relOS))
		if !isUnderDir(us.StagingDir, dstDir) {
			_ = part.Close()
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid upload path", map[string]any{"path": relPath})
			return
		}
		if err := os.MkdirAll(dstDir, 0o700); err != nil {
			_ = part.Close()
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to create upload directory", map[string]any{"error": err.Error()})
			return
		}

		filename := filepath.Base(relOS)
		dstPath := uniqueFilePath(dstDir, filename)
		if maxBytes > 0 && remainingBytes <= 0 {
			_ = part.Close()
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
			return
		}
		n, err := writePartToFile(part, dstPath, remainingBytes)
		if err != nil {
			if errors.Is(err, errUploadTooLarge) {
				writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
				return
			}
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to store file", map[string]any{"error": err.Error()})
			return
		}
		if maxBytes > 0 {
			remainingBytes -= n
		}
		written++
	}

	if written == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "no files uploaded", nil)
		return
	}

	if skipped > 0 {
		w.Header().Set("X-Upload-Skipped", fmt.Sprintf("%d", skipped))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleCommitUpload(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := chi.URLParam(r, "uploadId")
	if profileID == "" || uploadID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and uploadId are required", nil)
		return
	}

	_, ok, err := s.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load upload session", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "upload session not found", map[string]any{"uploadId": uploadID})
		return
	}

	if _, ok := jobs.DetectS5Cmd(); !ok {
		writeError(w, http.StatusBadRequest, "s5cmd_missing", "s5cmd is required to commit an upload (install it or set S5CMD_PATH)", nil)
		return
	}

	job, err := s.store.CreateJob(r.Context(), profileID, store.CreateJobInput{
		Type: jobs.JobTypeS5CmdSyncStagingToS3,
		Payload: map[string]any{
			"uploadId": uploadID,
		},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create job", nil)
		return
	}

	if err := s.jobs.Enqueue(job.ID); err != nil {
		if errors.Is(err, jobs.ErrJobQueueFull) {
			_, _ = s.store.DeleteJob(r.Context(), profileID, job.ID)
			stats := s.jobs.QueueStats()
			w.Header().Set("Retry-After", "2")
			writeError(
				w,
				http.StatusTooManyRequests,
				"job_queue_full",
				"job queue is full; try again later",
				map[string]any{"queueDepth": stats.Depth, "queueCapacity": stats.Capacity},
			)
			return
		}
		_, _ = s.store.DeleteJob(r.Context(), profileID, job.ID)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to enqueue job", nil)
		return
	}

	s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})

	writeJSON(w, http.StatusCreated, models.JobCreatedResponse{JobID: job.ID})
}

func (s *server) handleDeleteUpload(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := chi.URLParam(r, "uploadId")
	if profileID == "" || uploadID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and uploadId are required", nil)
		return
	}

	us, ok, err := s.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load upload session", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "upload session not found", map[string]any{"uploadId": uploadID})
		return
	}

	_, _ = s.store.DeleteUploadSession(r.Context(), profileID, uploadID)
	if us.StagingDir != "" {
		_ = os.RemoveAll(us.StagingDir)
	}

	w.WriteHeader(http.StatusNoContent)
}

func safeUploadPath(part *multipart.Part) string {
	p := sanitizeUploadPath(part.FileName())
	return p
}

func sanitizeUploadPath(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	name = strings.ReplaceAll(name, "\\", "/")
	name = strings.TrimLeft(name, "/")

	cleaned := path.Clean(name)
	if cleaned == "." || cleaned == ".." || cleaned == "" {
		return ""
	}
	if strings.HasPrefix(cleaned, "../") {
		return ""
	}
	if strings.ContainsRune(cleaned, 0) {
		return ""
	}
	return cleaned
}

func uniqueFilePath(dir, filename string) string {
	dst := filepath.Join(dir, filename)
	if _, err := os.Stat(dst); err != nil {
		return dst
	}
	ext := filepath.Ext(filename)
	base := strings.TrimSuffix(filename, ext)
	for i := 2; i < 10_000; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, i, ext))
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}
	return dst
}

var errUploadTooLarge = errors.New("upload too large")

func writePartToFile(part *multipart.Part, dstPath string, maxBytes int64) (int64, error) {
	defer func() { _ = part.Close() }()

	tmpPath := dstPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	var r io.Reader = part
	if maxBytes >= 0 {
		r = io.LimitReader(part, maxBytes+1)
	}
	n, copyErr := io.Copy(f, r)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return n, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return n, closeErr
	}
	if maxBytes >= 0 && n > maxBytes {
		_ = os.Remove(tmpPath)
		return n, errUploadTooLarge
	}
	if err := os.Rename(tmpPath, dstPath); err != nil {
		_ = os.Remove(tmpPath)
		return n, err
	}
	return n, nil
}

func dirSize(root string) (int64, error) {
	var total int64
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.Mode().IsRegular() {
			total += info.Size()
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}

func isUnderDir(dir, target string) bool {
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

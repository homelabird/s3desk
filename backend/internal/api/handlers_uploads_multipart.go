package api

import (
	"context"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

type uploadChunkQuery struct {
	path      string
	total     int
	chunkSize int64
	fileSize  int64
}

func buildMultipartCompletionParts(parts []models.UploadMultipartCompletePart) ([]types.CompletedPart, *uploadHTTPError) {
	completed := make([]types.CompletedPart, 0, len(parts))
	for _, part := range parts {
		if part.Number < 1 {
			return nil, &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "invalid_request",
				message: "invalid part number",
				details: map[string]any{"partNumber": part.Number},
			}
		}
		etag := strings.TrimSpace(part.ETag)
		if etag == "" {
			return nil, &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "invalid_request",
				message: "etag is required",
				details: map[string]any{"partNumber": part.Number},
			}
		}
		etag = strings.Trim(etag, "\"")
		etag = `"` + etag + `"`
		num := int32(part.Number)
		completed = append(completed, types.CompletedPart{
			ETag:       &etag,
			PartNumber: &num,
		})
	}
	sort.Slice(completed, func(i, j int) bool {
		if completed[i].PartNumber == nil || completed[j].PartNumber == nil {
			return false
		}
		return *completed[i].PartNumber < *completed[j].PartNumber
	})
	return completed, nil
}

func (s *server) loadMultipartUploadMeta(ctx context.Context, profileID, uploadID, relPath string) (store.MultipartUpload, *uploadHTTPError) {
	meta, ok, err := s.store.GetMultipartUpload(ctx, profileID, uploadID, relPath)
	if err != nil {
		return store.MultipartUpload{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load multipart upload",
		}
	}
	if !ok {
		return store.MultipartUpload{}, &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "multipart upload not found",
		}
	}
	return meta, nil
}

func (s *server) multipartClientFromContext(ctx context.Context, notSupportedMessage string) (*s3.Client, *uploadHTTPError) {
	secrets, ok := profileFromContext(ctx)
	if !ok {
		return nil, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "missing profile secrets",
		}
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return nil, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "not_supported",
			message: notSupportedMessage,
		}
	}
	client, err := s3ClientFromProfile(secrets)
	if err != nil {
		return nil, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to prepare multipart client",
		}
	}
	return client, nil
}

func parseUploadChunkQuery(values url.Values, requireTotal bool) (uploadChunkQuery, *uploadHTTPError) {
	pathRaw := sanitizeUploadPath(values.Get("path"))
	if pathRaw == "" {
		return uploadChunkQuery{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "path is required",
		}
	}

	query := uploadChunkQuery{path: pathRaw}
	if requireTotal {
		totalRaw := values.Get("total")
		total, err := strconv.Atoi(totalRaw)
		if err != nil || total <= 0 {
			return uploadChunkQuery{}, &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "invalid_request",
				message: "invalid total",
				details: map[string]any{"total": totalRaw},
			}
		}
		query.total = total
	}

	chunkSizeRaw := values.Get("chunkSize")
	chunkSize, err := strconv.ParseInt(chunkSizeRaw, 10, 64)
	if err != nil || chunkSize <= 0 {
		return uploadChunkQuery{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "invalid chunkSize",
			details: map[string]any{"chunkSize": chunkSizeRaw},
		}
	}
	query.chunkSize = chunkSize

	fileSizeRaw := values.Get("fileSize")
	fileSize, err := strconv.ParseInt(fileSizeRaw, 10, 64)
	if err != nil || fileSize <= 0 {
		return uploadChunkQuery{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "invalid fileSize",
			details: map[string]any{"fileSize": fileSizeRaw},
		}
	}
	query.fileSize = fileSize

	return query, nil
}

func buildRemoteMultipartChunkState(parts []types.Part, meta store.MultipartUpload) models.UploadChunkState {
	expectedTotal := int(math.Ceil(float64(meta.FileSize) / float64(meta.ChunkSize)))
	present := make([]int, 0, len(parts))
	for _, part := range parts {
		if part.PartNumber == nil {
			continue
		}
		index := int(*part.PartNumber) - 1
		if index < 0 || index >= expectedTotal {
			continue
		}
		expected := expectedUploadChunkSize(index, expectedTotal, meta.ChunkSize, meta.FileSize)
		if part.Size == nil || *part.Size != expected {
			continue
		}
		present = append(present, index)
	}
	sort.Ints(present)
	return models.UploadChunkState{Present: present}
}

func buildStagingMultipartChunkState(chunkDir string, total int, chunkSize, fileSize int64) models.UploadChunkState {
	present := make([]int, 0, total)
	for i := 0; i < total; i++ {
		partPath := filepath.Join(chunkDir, chunkPartName(i))
		info, err := os.Stat(partPath)
		if err != nil {
			continue
		}
		expected := expectedUploadChunkSize(i, total, chunkSize, fileSize)
		if expected > 0 && info.Size() != expected {
			_ = os.Remove(partPath)
			continue
		}
		present = append(present, i)
	}
	return models.UploadChunkState{Present: present}
}

func expectedUploadChunkSize(index, total int, chunkSize, fileSize int64) int64 {
	expected := chunkSize
	if index == total-1 {
		remaining := fileSize - (int64(total-1) * chunkSize)
		if remaining > 0 {
			expected = remaining
		}
	}
	return expected
}

func (s *server) handleCompleteMultipartUpload(w http.ResponseWriter, r *http.Request) {
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
	mode := normalizeUploadMode(us.Mode)
	if mode != uploadModePresigned {
		writeError(w, http.StatusBadRequest, "not_supported", "multipart completion requires a presigned upload session", nil)
		return
	}
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil {
		if time.Now().UTC().After(expiresAt) {
			writeError(w, http.StatusBadRequest, "expired", "upload session expired", nil)
			return
		}
	}

	var req models.UploadMultipartCompleteRequest
	if err := decodeJSONWithOptions(r, &req, jsonDecodeOptions{maxBytes: uploadMultipartJSONRequestBodyMaxBytes}); err != nil {
		writeJSONDecodeError(w, err, uploadMultipartJSONRequestBodyMaxBytes)
		return
	}
	relPath := sanitizeUploadPath(req.Path)
	if relPath == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "path is required", nil)
		return
	}
	if len(req.Parts) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "parts are required", nil)
		return
	}

	meta, uploadErr := s.loadMultipartUploadMeta(r.Context(), profileID, uploadID, relPath)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	client, uploadErr := s.multipartClientFromContext(r.Context(), "multipart completion requires an S3-compatible provider")
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	completed, uploadErr := buildMultipartCompletionParts(req.Parts)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}

	_, err = client.CompleteMultipartUpload(r.Context(), &s3.CompleteMultipartUploadInput{
		Bucket:   &meta.Bucket,
		Key:      &meta.ObjectKey,
		UploadId: &meta.S3UploadID,
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: completed,
		},
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "upload_failed", "failed to complete multipart upload", map[string]any{"error": err.Error()})
		return
	}
	expectedSize := meta.FileSize
	if err := s.store.UpsertUploadObject(r.Context(), store.UploadObject{
		UploadID:     uploadID,
		ProfileID:    profileID,
		Path:         meta.Path,
		Bucket:       meta.Bucket,
		ObjectKey:    meta.ObjectKey,
		ExpectedSize: &expectedSize,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to persist upload object", nil)
		return
	}
	_ = s.store.DeleteMultipartUpload(r.Context(), profileID, uploadID, relPath)
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleAbortMultipartUpload(w http.ResponseWriter, r *http.Request) {
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
	mode := normalizeUploadMode(us.Mode)
	if mode != uploadModePresigned {
		writeError(w, http.StatusBadRequest, "not_supported", "multipart abort requires a presigned upload session", nil)
		return
	}

	var req models.UploadMultipartAbortRequest
	if err := decodeJSONWithOptions(r, &req, jsonDecodeOptions{maxBytes: uploadMultipartJSONRequestBodyMaxBytes}); err != nil {
		writeJSONDecodeError(w, err, uploadMultipartJSONRequestBodyMaxBytes)
		return
	}
	relPath := sanitizeUploadPath(req.Path)
	if relPath == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "path is required", nil)
		return
	}

	meta, uploadErr := s.loadMultipartUploadMeta(r.Context(), profileID, uploadID, relPath)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	client, uploadErr := s.multipartClientFromContext(r.Context(), "multipart abort requires an S3-compatible provider")
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	if err := s.abortMultipartUpload(r.Context(), client, meta); err != nil {
		writeError(w, http.StatusBadGateway, "upload_failed", "failed to abort multipart upload", map[string]any{"error": err.Error()})
		return
	}
	_ = s.store.DeleteMultipartUpload(r.Context(), profileID, uploadID, relPath)
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleGetUploadChunks(w http.ResponseWriter, r *http.Request) {
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
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil {
		if time.Now().UTC().After(expiresAt) {
			writeError(w, http.StatusBadRequest, "expired", "upload session expired", nil)
			return
		}
	}
	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode != uploadModeStaging {
		query, uploadErr := parseUploadChunkQuery(r.URL.Query(), false)
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}
		meta, uploadErr := s.loadMultipartUploadMeta(r.Context(), profileID, uploadID, query.path)
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}
		if meta.FileSize != query.fileSize || meta.ChunkSize != query.chunkSize {
			writeError(w, http.StatusNotFound, "not_found", "multipart upload not found", nil)
			return
		}
		client, uploadErr := s.multipartClientFromContext(r.Context(), "multipart status requires an S3-compatible provider")
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}
		parts, err := s.listMultipartParts(r.Context(), client, meta)
		if err != nil {
			writeError(w, http.StatusBadGateway, "upload_failed", "failed to list multipart parts", map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, buildRemoteMultipartChunkState(parts, meta))
		return
	}

	query, uploadErr := parseUploadChunkQuery(r.URL.Query(), true)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	if us.StagingDir == "" {
		writeError(w, http.StatusInternalServerError, "internal_error", "upload session is missing staging directory", nil)
		return
	}
	stagingDir, err := store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "upload session has invalid staging directory", map[string]any{"error": err.Error()})
		return
	}

	relOS := filepath.FromSlash(query.path)
	chunkDir := filepath.Join(stagingDir, ".chunks", relOS)
	if !isUnderDir(stagingDir, chunkDir) {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid upload path", map[string]any{"path": query.path})
		return
	}
	writeJSON(w, http.StatusOK, buildStagingMultipartChunkState(chunkDir, query.total, query.chunkSize, query.fileSize))
}

func (s *server) listMultipartParts(ctx context.Context, client *s3.Client, meta store.MultipartUpload) ([]types.Part, error) {
	input := &s3.ListPartsInput{
		Bucket:   &meta.Bucket,
		Key:      &meta.ObjectKey,
		UploadId: &meta.S3UploadID,
	}
	paginator := s3.NewListPartsPaginator(client, input)
	parts := make([]types.Part, 0, 16)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		parts = append(parts, page.Parts...)
	}
	return parts, nil
}

func (s *server) abortMultipartUpload(ctx context.Context, client *s3.Client, meta store.MultipartUpload) error {
	_, err := client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   &meta.Bucket,
		Key:      &meta.ObjectKey,
		UploadId: &meta.S3UploadID,
	})
	return err
}

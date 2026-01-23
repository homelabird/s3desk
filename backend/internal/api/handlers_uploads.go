package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/go-chi/chi/v5"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
	"s3desk/internal/ws"
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
	mode := normalizeUploadMode(req.Mode)
	if mode == "" {
		if s.cfg.UploadDirectStream {
			mode = uploadModeDirect
		} else {
			mode = uploadModeStaging
		}
	}
	switch mode {
	case uploadModeStaging, uploadModeDirect, uploadModePresigned:
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid upload mode", map[string]any{"mode": req.Mode})
		return
	}
	if mode == uploadModeDirect && !s.cfg.UploadDirectStream {
		writeError(w, http.StatusBadRequest, "not_supported", "direct streaming uploads are disabled", nil)
		return
	}
	if mode == uploadModePresigned {
		secrets, ok := profileFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
			return
		}
		if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			writeError(w, http.StatusBadRequest, "not_supported", "presigned uploads require an S3-compatible provider", nil)
			return
		}
	}

	expiresAt := time.Now().UTC().Add(s.cfg.UploadSessionTTL).Format(time.RFC3339Nano)

	us, err := s.store.CreateUploadSession(r.Context(), profileID, req.Bucket, req.Prefix, mode, "", expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create upload session", nil)
		return
	}

	if mode == uploadModeStaging {
		stagingBase := filepath.Join(s.cfg.DataDir, "staging")
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
	}

	var maxBytes *int64
	if s.cfg.UploadMaxBytes > 0 {
		v := s.cfg.UploadMaxBytes
		maxBytes = &v
	}

	writeJSON(w, http.StatusCreated, models.UploadCreateResponse{
		UploadID:  us.ID,
		Mode:      mode,
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

	release, ok := s.acquireUploadSlot(w)
	if !ok {
		return
	}
	defer release()

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
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode == uploadModePresigned {
		writeError(w, http.StatusBadRequest, "not_supported", "presigned uploads do not accept file bodies", nil)
		return
	}
	if mode == uploadModeDirect && !s.cfg.UploadDirectStream {
		writeError(w, http.StatusBadRequest, "not_supported", "direct streaming uploads are disabled", nil)
		return
	}
	if mode == uploadModeStaging && us.StagingDir == "" {
		writeError(w, http.StatusInternalServerError, "internal_error", "upload session is missing staging directory", nil)
		return
	}

	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil {
		if time.Now().UTC().After(expiresAt) {
			writeError(w, http.StatusBadRequest, "expired", "upload session expired", nil)
			return
		}
	}

	chunkIndexRaw := strings.TrimSpace(r.Header.Get("X-Upload-Chunk-Index"))
	if mode == uploadModeDirect && chunkIndexRaw != "" {
		if !ok {
			writeError(w, http.StatusInternalServerError, "internal_error", "upload session not found", nil)
			return
		}
		secrets, ok := profileFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
			return
		}
		if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			writeError(w, http.StatusBadRequest, "not_supported", "direct streaming multipart uploads require an S3-compatible provider", nil)
			return
		}

		chunkTotalRaw := strings.TrimSpace(r.Header.Get("X-Upload-Chunk-Total"))
		relPath := sanitizeUploadPath(r.Header.Get("X-Upload-Relative-Path"))
		if chunkTotalRaw == "" || relPath == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "chunk uploads require X-Upload-Chunk-Total and X-Upload-Relative-Path", nil)
			return
		}
		chunkIndex, err := strconv.Atoi(chunkIndexRaw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid X-Upload-Chunk-Index", map[string]any{"error": err.Error()})
			return
		}
		chunkTotal, err := strconv.Atoi(chunkTotalRaw)
		if err != nil || chunkTotal <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid X-Upload-Chunk-Total", map[string]any{"error": err.Error()})
			return
		}
		if chunkIndex < 0 || chunkIndex >= chunkTotal {
			writeError(w, http.StatusBadRequest, "invalid_request", "chunk index out of range", map[string]any{"index": chunkIndex})
			return
		}

		chunkSizeRaw := strings.TrimSpace(r.Header.Get("X-Upload-Chunk-Size"))
		chunkSize, err := strconv.ParseInt(chunkSizeRaw, 10, 64)
		if err != nil || chunkSize <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid X-Upload-Chunk-Size", map[string]any{"chunkSize": chunkSizeRaw})
			return
		}
		fileSizeRaw := strings.TrimSpace(r.Header.Get("X-Upload-File-Size"))
		fileSize, err := strconv.ParseInt(fileSizeRaw, 10, 64)
		if err != nil || fileSize <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid X-Upload-File-Size", map[string]any{"fileSize": fileSizeRaw})
			return
		}
		if s.cfg.UploadMaxBytes > 0 && fileSize > s.cfg.UploadMaxBytes {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": s.cfg.UploadMaxBytes})
			return
		}

		key := relPath
		if us.Prefix != "" {
			key = path.Join(us.Prefix, relPath)
		}

		client, err := s3ClientFromProfile(secrets)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
			return
		}

		meta, found, err := s.store.GetMultipartUpload(r.Context(), profileID, uploadID, relPath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart upload", nil)
			return
		}

		expectedChunkSize := chunkSize
		if chunkIndex == chunkTotal-1 {
			expectedChunkSize = chunkSize
		}

		now := time.Now().UTC().Format(time.RFC3339Nano)
		if found {
			if meta.FileSize != fileSize || meta.ChunkSize <= 0 {
				if err := s.abortMultipartUpload(r.Context(), client, meta); err != nil {
					writeError(w, http.StatusBadGateway, "upload_failed", "failed to reset multipart upload", nil)
					return
				}
				_ = s.store.DeleteMultipartUpload(r.Context(), profileID, uploadID, relPath)
				found = false
			} else if meta.ChunkSize != chunkSize && chunkIndex < chunkTotal-1 {
				writeError(w, http.StatusBadRequest, "invalid_request", "chunk size mismatch", map[string]any{"chunkSize": chunkSize})
				return
			}
		}

		if !found {
			resp, err := client.CreateMultipartUpload(r.Context(), &s3.CreateMultipartUploadInput{
				Bucket: &us.Bucket,
				Key:    &key,
			})
			if err != nil || resp.UploadId == nil || *resp.UploadId == "" {
				writeError(w, http.StatusBadGateway, "upload_failed", "failed to create multipart upload", map[string]any{"error": err.Error()})
				return
			}
			meta = store.MultipartUpload{
				UploadID:   uploadID,
				ProfileID:  profileID,
				Path:       relPath,
				Bucket:     us.Bucket,
				ObjectKey:  key,
				S3UploadID: *resp.UploadId,
				ChunkSize:  expectedChunkSize,
				FileSize:   fileSize,
				CreatedAt:  now,
				UpdatedAt:  now,
			}
		} else {
			meta.UpdatedAt = now
		}

		if err := s.store.UpsertMultipartUpload(r.Context(), meta); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to persist multipart upload", nil)
			return
		}

		partNumber := int32(chunkIndex + 1)
		contentLength := chunkSize
		if chunkIndex == chunkTotal-1 {
			remaining := fileSize - (int64(chunkTotal-1) * meta.ChunkSize)
			if remaining > 0 && remaining < contentLength {
				contentLength = remaining
			}
		}

		_, err = client.UploadPart(r.Context(), &s3.UploadPartInput{
			Bucket:        &us.Bucket,
			Key:           &key,
			PartNumber:    &partNumber,
			UploadId:      &meta.S3UploadID,
			Body:          r.Body,
			ContentLength: &contentLength,
		})
		if err != nil {
			writeError(w, http.StatusBadGateway, "upload_failed", "failed to upload multipart part", map[string]any{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return
	}

	if mode == uploadModeDirect {
		secrets, ok := profileFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
			return
		}

		reader, err := r.MultipartReader()
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "expected multipart/form-data", map[string]any{"error": err.Error()})
			return
		}

		maxBytes := s.cfg.UploadMaxBytes
		remainingBytes := int64(-1)
		if maxBytes > 0 {
			remainingBytes = maxBytes
		}

		written := 0
		skipped := 0
		for {
			part, err := reader.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid_request", "failed to read multipart upload", map[string]any{"error": err.Error()})
				return
			}
			if part.FormName() != "files" {
				_ = part.Close()
				continue
			}

			relPath := safeUploadPath(part)
			if relPath == "" {
				_ = part.Close()
				skipped++
				continue
			}
			key := relPath
			if us.Prefix != "" {
				key = path.Join(us.Prefix, relPath)
			}

			source := io.Reader(part)
			if remainingBytes >= 0 {
				source = io.LimitReader(source, remainingBytes+1)
			}
			counter := &countingReader{r: source}
			target := rcloneRemoteObject(us.Bucket, key, secrets.PreserveLeadingSlash)
			stderr, err := s.runRcloneStdin(r.Context(), secrets, []string{"rcat", target}, "upload-stream", counter)
			_ = part.Close()
			if err != nil {
				writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
					MissingMessage: "rclone is required to stream uploads (install it or set RCLONE_PATH)",
					DefaultStatus:  http.StatusBadGateway,
					DefaultCode:    "upload_failed",
					DefaultMessage: "failed to stream upload",
				}, map[string]any{"path": relPath})
				return
			}

			if remainingBytes >= 0 {
				if counter.n > remainingBytes {
					_, _, _ = s.runRcloneCapture(r.Context(), secrets, []string{"deletefile", target}, "upload-stream-cleanup")
					writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
					return
				}
				remainingBytes -= counter.n
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
		return
	}

	bytesTracked := us.Bytes
	if chunkIndexRaw != "" {
		chunkTotalRaw := strings.TrimSpace(r.Header.Get("X-Upload-Chunk-Total"))
		relPath := sanitizeUploadPath(r.Header.Get("X-Upload-Relative-Path"))
		if chunkTotalRaw == "" || relPath == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "chunk uploads require X-Upload-Chunk-Total and X-Upload-Relative-Path", nil)
			return
		}
		chunkIndex, err := strconv.Atoi(chunkIndexRaw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid X-Upload-Chunk-Index", map[string]any{"error": err.Error()})
			return
		}
		chunkTotal, err := strconv.Atoi(chunkTotalRaw)
		if err != nil || chunkTotal <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid X-Upload-Chunk-Total", map[string]any{"error": err.Error()})
			return
		}
		if chunkIndex < 0 || chunkIndex >= chunkTotal {
			writeError(w, http.StatusBadRequest, "invalid_request", "chunk index out of range", map[string]any{"index": chunkIndex})
			return
		}

		relOS := filepath.FromSlash(relPath)
		chunkDir := filepath.Join(us.StagingDir, ".chunks", relOS)
		if !isUnderDir(us.StagingDir, chunkDir) {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid upload path", map[string]any{"path": relPath})
			return
		}
		if err := os.MkdirAll(chunkDir, 0o700); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to create chunk directory", map[string]any{"error": err.Error()})
			return
		}

		maxBytes := s.cfg.UploadMaxBytes
		remainingBytes := int64(-1)
		if maxBytes > 0 {
			remainingBytes = maxBytes - bytesTracked
			if remainingBytes <= 0 {
				writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
				return
			}
		}

		chunkPath := filepath.Join(chunkDir, chunkPartName(chunkIndex))
		var prevSize int64
		if info, err := os.Stat(chunkPath); err == nil {
			prevSize = info.Size()
		}
		if maxBytes > 0 && remainingBytes <= 0 {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
			return
		}
		defer func() { _ = r.Body.Close() }()
		limitBytes := remainingBytes
		if maxBytes > 0 {
			limitBytes = remainingBytes + prevSize
		}
		n, err := writeReaderToFile(r.Body, chunkPath, limitBytes)
		if err != nil {
			if errors.Is(err, errUploadTooLarge) {
				writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
				return
			}
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to store chunk", map[string]any{"error": err.Error()})
			return
		}
		delta := n - prevSize
		if delta != 0 {
			if err := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, delta); err != nil {
				writeError(w, http.StatusInternalServerError, "internal_error", "failed to update upload bytes", map[string]any{"error": err.Error()})
				return
			}
			bytesTracked += delta
		}
		if maxBytes > 0 {
			remainingBytes = maxBytes - bytesTracked
		}

		if err := tryAssembleChunkFile(us.StagingDir, relOS, chunkDir, chunkTotal, func(delta int64) {
			if delta == 0 {
				return
			}
			_ = s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, delta)
			bytesTracked += delta
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to assemble upload", map[string]any{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return
	}

	reader, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "expected multipart/form-data", map[string]any{"error": err.Error()})
		return
	}

	maxBytes := s.cfg.UploadMaxBytes
	remainingBytes := int64(-1)
	if maxBytes > 0 {
		remainingBytes = maxBytes - bytesTracked
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
		if err := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, n); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to update upload bytes", map[string]any{"error": err.Error()})
			return
		}
		bytesTracked += n
		if maxBytes > 0 {
			remainingBytes = maxBytes - bytesTracked
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

func (s *server) handlePresignUpload(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := chi.URLParam(r, "uploadId")
	if profileID == "" || uploadID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profile and uploadId are required", nil)
		return
	}

	release, ok := s.acquireUploadSlot(w)
	if !ok {
		return
	}
	defer release()

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
		writeError(w, http.StatusBadRequest, "not_supported", "presign requires a presigned upload session", nil)
		return
	}
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil {
		if time.Now().UTC().After(expiresAt) {
			writeError(w, http.StatusBadRequest, "expired", "upload session expired", nil)
			return
		}
	}

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
		return
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		writeError(w, http.StatusBadRequest, "not_supported", "presigned uploads require an S3-compatible provider", nil)
		return
	}

	var req models.UploadPresignRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	relPath := sanitizeUploadPath(req.Path)
	if relPath == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "path is required", nil)
		return
	}
	key := relPath
	if us.Prefix != "" {
		key = path.Join(us.Prefix, relPath)
	}

	expiresSeconds := 900
	if req.ExpiresSeconds != nil {
		expiresSeconds = *req.ExpiresSeconds
	}
	if expiresSeconds < 60 {
		expiresSeconds = 60
	}
	if expiresSeconds > 3600 {
		expiresSeconds = 3600
	}
	expires := time.Duration(expiresSeconds) * time.Second
	expiresAt := time.Now().UTC().Add(expires).Format(time.RFC3339Nano)

	if req.Multipart != nil {
		if req.Multipart.FileSize == nil || *req.Multipart.FileSize <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "fileSize is required for multipart presign", nil)
			return
		}
		if req.Multipart.PartSizeBytes <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "partSizeBytes is required for multipart presign", nil)
			return
		}
		partSize := req.Multipart.PartSizeBytes
		if partSize < 5*1024*1024 {
			writeError(w, http.StatusBadRequest, "invalid_request", "partSizeBytes must be at least 5MiB", nil)
			return
		}
		fileSize := *req.Multipart.FileSize
		partCount := int(math.Ceil(float64(fileSize) / float64(partSize)))
		if partCount <= 1 {
			writeError(w, http.StatusBadRequest, "invalid_request", "multipart upload requires at least 2 parts", nil)
			return
		}
		if partCount > 10_000 {
			writeError(w, http.StatusBadRequest, "invalid_request", "multipart upload exceeds 10,000 parts", nil)
			return
		}

		partNumbers := req.Multipart.PartNumbers
		if len(partNumbers) == 0 {
			partNumbers = make([]int, 0, partCount)
			for i := 1; i <= partCount; i++ {
				partNumbers = append(partNumbers, i)
			}
		}
		seen := make(map[int]struct{}, len(partNumbers))
		for _, num := range partNumbers {
			if num < 1 || num > partCount {
				writeError(w, http.StatusBadRequest, "invalid_request", "invalid part number", map[string]any{"partNumber": num})
				return
			}
			if _, exists := seen[num]; exists {
				writeError(w, http.StatusBadRequest, "invalid_request", "duplicate part number", map[string]any{"partNumber": num})
				return
			}
			seen[num] = struct{}{}
		}

		meta, found, err := s.store.GetMultipartUpload(r.Context(), profileID, uploadID, relPath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart upload", nil)
			return
		}
		if found && (meta.FileSize != fileSize || meta.ChunkSize != partSize) {
			if client, err := s3ClientFromProfile(secrets); err == nil {
				_ = s.abortMultipartUpload(r.Context(), client, meta)
			}
			_ = s.store.DeleteMultipartUpload(r.Context(), profileID, uploadID, relPath)
			found = false
		}
		if !found {
			client, err := s3ClientFromProfile(secrets)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
				return
			}
			input := &s3.CreateMultipartUploadInput{
				Bucket: &us.Bucket,
				Key:    &key,
			}
			if ct := strings.TrimSpace(req.ContentType); ct != "" {
				input.ContentType = &ct
			}
			resp, err := client.CreateMultipartUpload(r.Context(), input)
			if err != nil || resp.UploadId == nil || *resp.UploadId == "" {
				writeError(w, http.StatusBadGateway, "upload_failed", "failed to create multipart upload", map[string]any{"error": err.Error()})
				return
			}
			now := time.Now().UTC().Format(time.RFC3339Nano)
			meta = store.MultipartUpload{
				UploadID:   uploadID,
				ProfileID:  profileID,
				Path:       relPath,
				Bucket:     us.Bucket,
				ObjectKey:  key,
				S3UploadID: *resp.UploadId,
				ChunkSize:  partSize,
				FileSize:   fileSize,
				CreatedAt:  now,
				UpdatedAt:  now,
			}
			if err := s.store.UpsertMultipartUpload(r.Context(), meta); err != nil {
				writeError(w, http.StatusInternalServerError, "internal_error", "failed to persist multipart upload", nil)
				return
			}
		}

		presigner, err := s3PresignClientFromProfile(secrets)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare presigner", nil)
			return
		}
		sort.Ints(partNumbers)
		parts := make([]models.UploadPresignPart, 0, len(partNumbers))
		for _, num := range partNumbers {
			partNumber := int32(num)
			resp, err := presigner.PresignUploadPart(r.Context(), &s3.UploadPartInput{
				Bucket:     &us.Bucket,
				Key:        &key,
				UploadId:   &meta.S3UploadID,
				PartNumber: &partNumber,
			}, s3.WithPresignExpires(expires))
			if err != nil {
				writeError(w, http.StatusBadGateway, "upload_failed", "failed to presign multipart upload", map[string]any{"error": err.Error()})
				return
			}
			headers := flattenSignedHeaders(resp.SignedHeader)
			if len(headers) == 0 {
				headers = nil
			}
			parts = append(parts, models.UploadPresignPart{
				Number:  num,
				Method:  http.MethodPut,
				URL:     resp.URL,
				Headers: headers,
			})
		}

		writeJSON(w, http.StatusOK, models.UploadPresignResponse{
			Mode:      "multipart",
			Bucket:    us.Bucket,
			Key:       key,
			ExpiresAt: expiresAt,
			Multipart: &models.UploadPresignMultipart{
				UploadID:      meta.S3UploadID,
				PartSizeBytes: partSize,
				PartCount:     partCount,
				Parts:         parts,
			},
		})
		return
	}

	if req.Size != nil && s.cfg.UploadMaxBytes > 0 && *req.Size > s.cfg.UploadMaxBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds maxBytes", map[string]any{"maxBytes": s.cfg.UploadMaxBytes})
		return
	}

	presigner, err := s3PresignClientFromProfile(secrets)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare presigner", nil)
		return
	}
	input := &s3.PutObjectInput{
		Bucket: &us.Bucket,
		Key:    &key,
	}
	if ct := strings.TrimSpace(req.ContentType); ct != "" {
		input.ContentType = &ct
	}
	resp, err := presigner.PresignPutObject(r.Context(), input, s3.WithPresignExpires(expires))
	if err != nil {
		writeError(w, http.StatusBadGateway, "upload_failed", "failed to presign upload", map[string]any{"error": err.Error()})
		return
	}
	headers := flattenSignedHeaders(resp.SignedHeader)
	if len(headers) == 0 {
		headers = nil
	}
	writeJSON(w, http.StatusOK, models.UploadPresignResponse{
		Mode:      "single",
		Bucket:    us.Bucket,
		Key:       key,
		Method:    http.MethodPut,
		URL:       resp.URL,
		Headers:   headers,
		ExpiresAt: expiresAt,
	})
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
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
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

	meta, ok, err := s.store.GetMultipartUpload(r.Context(), profileID, uploadID, relPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart upload", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "multipart upload not found", nil)
		return
	}

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
		return
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		writeError(w, http.StatusBadRequest, "not_supported", "multipart completion requires an S3-compatible provider", nil)
		return
	}
	client, err := s3ClientFromProfile(secrets)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
		return
	}

	completed := make([]types.CompletedPart, 0, len(req.Parts))
	for _, part := range req.Parts {
		if part.Number < 1 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid part number", map[string]any{"partNumber": part.Number})
			return
		}
		etag := strings.TrimSpace(part.ETag)
		if etag == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "etag is required", map[string]any{"partNumber": part.Number})
			return
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
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	relPath := sanitizeUploadPath(req.Path)
	if relPath == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "path is required", nil)
		return
	}

	meta, ok, err := s.store.GetMultipartUpload(r.Context(), profileID, uploadID, relPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart upload", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "multipart upload not found", nil)
		return
	}

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
		return
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		writeError(w, http.StatusBadRequest, "not_supported", "multipart abort requires an S3-compatible provider", nil)
		return
	}
	client, err := s3ClientFromProfile(secrets)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
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
		pathRaw := sanitizeUploadPath(r.URL.Query().Get("path"))
		if pathRaw == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "path is required", nil)
			return
		}
		chunkSizeRaw := r.URL.Query().Get("chunkSize")
		chunkSize, err := strconv.ParseInt(chunkSizeRaw, 10, 64)
		if err != nil || chunkSize <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid chunkSize", map[string]any{"chunkSize": chunkSizeRaw})
			return
		}
		fileSizeRaw := r.URL.Query().Get("fileSize")
		fileSize, err := strconv.ParseInt(fileSizeRaw, 10, 64)
		if err != nil || fileSize <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid fileSize", map[string]any{"fileSize": fileSizeRaw})
			return
		}

		meta, ok, err := s.store.GetMultipartUpload(r.Context(), profileID, uploadID, pathRaw)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart upload", nil)
			return
		}
		if !ok || meta.FileSize != fileSize || meta.ChunkSize != chunkSize {
			writeError(w, http.StatusNotFound, "not_found", "multipart upload not found", nil)
			return
		}

		secrets, ok := profileFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
			return
		}
		if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			writeError(w, http.StatusBadRequest, "not_supported", "multipart status requires an S3-compatible provider", nil)
			return
		}
		client, err := s3ClientFromProfile(secrets)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
			return
		}

		parts, err := s.listMultipartParts(r.Context(), client, meta)
		if err != nil {
			writeError(w, http.StatusBadGateway, "upload_failed", "failed to list multipart parts", map[string]any{"error": err.Error()})
			return
		}

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
			expected := meta.ChunkSize
			if index == expectedTotal-1 {
				remaining := meta.FileSize - (int64(expectedTotal-1) * meta.ChunkSize)
				if remaining > 0 {
					expected = remaining
				}
			}
			if part.Size == nil || *part.Size != expected {
				continue
			}
			present = append(present, index)
		}

		writeJSON(w, http.StatusOK, models.UploadChunkState{Present: present})
		return
	}

	pathRaw := sanitizeUploadPath(r.URL.Query().Get("path"))
	if pathRaw == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "path is required", nil)
		return
	}
	totalRaw := r.URL.Query().Get("total")
	total, err := strconv.Atoi(totalRaw)
	if err != nil || total <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid total", map[string]any{"total": totalRaw})
		return
	}
	chunkSizeRaw := r.URL.Query().Get("chunkSize")
	chunkSize, err := strconv.ParseInt(chunkSizeRaw, 10, 64)
	if err != nil || chunkSize <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid chunkSize", map[string]any{"chunkSize": chunkSizeRaw})
		return
	}
	fileSizeRaw := r.URL.Query().Get("fileSize")
	fileSize, err := strconv.ParseInt(fileSizeRaw, 10, 64)
	if err != nil || fileSize <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid fileSize", map[string]any{"fileSize": fileSizeRaw})
		return
	}

	if us.StagingDir == "" {
		writeError(w, http.StatusInternalServerError, "internal_error", "upload session is missing staging directory", nil)
		return
	}

	relOS := filepath.FromSlash(pathRaw)
	chunkDir := filepath.Join(us.StagingDir, ".chunks", relOS)
	if !isUnderDir(us.StagingDir, chunkDir) {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid upload path", map[string]any{"path": pathRaw})
		return
	}

	present := make([]int, 0, total)
	for i := 0; i < total; i++ {
		partPath := filepath.Join(chunkDir, chunkPartName(i))
		info, err := os.Stat(partPath)
		if err != nil {
			continue
		}
		expected := chunkSize
		if i == total-1 {
			remaining := fileSize - (int64(total-1) * chunkSize)
			if remaining > 0 {
				expected = remaining
			}
		}
		if expected > 0 && info.Size() != expected {
			_ = os.Remove(partPath)
			continue
		}
		present = append(present, i)
	}

	writeJSON(w, http.StatusOK, models.UploadChunkState{Present: present})
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

func (s *server) handleCommitUpload(w http.ResponseWriter, r *http.Request) {
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
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode == uploadModeDirect && !s.cfg.UploadDirectStream {
		writeError(w, http.StatusBadRequest, "not_supported", "direct streaming uploads are disabled", nil)
		return
	}

	var req uploadCommitRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	payload := map[string]any{
		"uploadId": uploadID,
		"bucket":   us.Bucket,
	}
	if us.Prefix != "" {
		payload["prefix"] = us.Prefix
	}

	label := strings.TrimSpace(req.Label)
	if label != "" {
		payload["label"] = label
	}
	rootName := strings.TrimSpace(req.RootName)
	if rootName != "" {
		payload["rootName"] = rootName
	}
	if req.RootKind != "" {
		switch req.RootKind {
		case "file", "folder", "collection":
			payload["rootKind"] = req.RootKind
		}
	}
	if req.TotalFiles != nil {
		payload["totalFiles"] = *req.TotalFiles
	}
	if req.TotalBytes != nil {
		payload["totalBytes"] = *req.TotalBytes
	}

	itemsTruncated := req.ItemsTruncated
	items := req.Items
	if len(items) > maxCommitItems {
		items = items[:maxCommitItems]
		itemsTruncated = true
	}
	indexEntries := make([]store.ObjectIndexEntry, 0, len(items))
	if len(items) > 0 {
		cleaned := make([]map[string]any, 0, len(items))
		for _, item := range items {
			cleanedPath := sanitizeUploadPath(item.Path)
			if cleanedPath == "" {
				continue
			}
			key := cleanedPath
			if us.Prefix != "" {
				key = path.Join(us.Prefix, cleanedPath)
			}
			entry := map[string]any{
				"path": cleanedPath,
				"key":  key,
			}
			if item.Size != nil && *item.Size >= 0 {
				entry["size"] = *item.Size
				indexEntries = append(indexEntries, store.ObjectIndexEntry{
					Key:  key,
					Size: *item.Size,
				})
			}
			cleaned = append(cleaned, entry)
		}
		if len(cleaned) > 0 {
			payload["items"] = cleaned
		}
	}
	if itemsTruncated {
		payload["itemsTruncated"] = true
	}

	buildProgress := func() *models.JobProgress {
		if req.TotalBytes == nil && req.TotalFiles == nil {
			return nil
		}
		p := models.JobProgress{}
		if req.TotalBytes != nil && *req.TotalBytes >= 0 {
			total := *req.TotalBytes
			p.BytesTotal = &total
			p.BytesDone = &total
		}
		if req.TotalFiles != nil && *req.TotalFiles >= 0 {
			total := int64(*req.TotalFiles)
			p.ObjectsTotal = &total
			p.ObjectsDone = &total
		}
		return &p
	}

	if mode == uploadModePresigned {
		multipartUploads, err := s.store.ListMultipartUploads(r.Context(), profileID, uploadID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart uploads", nil)
			return
		}
		if len(multipartUploads) > 0 {
			writeError(w, http.StatusBadRequest, "upload_incomplete", "multipart uploads are not finalized", nil)
			return
		}

		job, err := s.store.CreateJob(r.Context(), profileID, store.CreateJobInput{
			Type:    jobs.JobTypeTransferDirectUpload,
			Payload: payload,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to create job", nil)
			return
		}

		now := time.Now().UTC().Format(time.RFC3339Nano)
		progress := buildProgress()
		if err := s.store.UpdateJobStatus(r.Context(), job.ID, models.JobStatusSucceeded, &now, &now, progress, nil, nil); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to finalize job", nil)
			return
		}
		if len(indexEntries) > 0 {
			_ = s.store.UpsertObjectIndexBatch(r.Context(), profileID, us.Bucket, indexEntries, now)
		}

		_ = s.store.DeleteMultipartUploadsBySession(r.Context(), profileID, uploadID)
		_, _ = s.store.DeleteUploadSession(r.Context(), profileID, uploadID)
		payload := map[string]any{"status": models.JobStatusSucceeded}
		if progress != nil {
			payload["progress"] = progress
		}
		s.hub.Publish(ws.Event{Type: "job.completed", JobID: job.ID, Payload: payload})
		writeJSON(w, http.StatusCreated, models.JobCreatedResponse{JobID: job.ID})
		return
	}

	if mode == uploadModeDirect {
		secrets, ok := profileFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusInternalServerError, "internal_error", "missing profile secrets", nil)
			return
		}
		if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			writeError(w, http.StatusBadRequest, "not_supported", "direct streaming multipart uploads require an S3-compatible provider", nil)
			return
		}

		multipartUploads, err := s.store.ListMultipartUploads(r.Context(), profileID, uploadID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart uploads", nil)
			return
		}

		if len(multipartUploads) > 0 {
			client, err := s3ClientFromProfile(secrets)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
				return
			}

			for _, meta := range multipartUploads {
				if meta.ChunkSize <= 0 || meta.FileSize <= 0 {
					writeError(w, http.StatusBadRequest, "invalid_request", "multipart metadata missing size", map[string]any{"path": meta.Path})
					return
				}
				parts, err := s.listMultipartParts(r.Context(), client, meta)
				if err != nil {
					writeError(w, http.StatusBadGateway, "upload_failed", "failed to list multipart parts", map[string]any{"path": meta.Path})
					return
				}
				expectedTotal := int(math.Ceil(float64(meta.FileSize) / float64(meta.ChunkSize)))
				partByNumber := make(map[int32]types.Part, len(parts))
				for _, part := range parts {
					if part.PartNumber == nil {
						continue
					}
					partByNumber[*part.PartNumber] = part
				}
				if len(partByNumber) < expectedTotal {
					writeError(w, http.StatusBadRequest, "upload_incomplete", "multipart upload is missing parts", map[string]any{"path": meta.Path})
					return
				}
				completed := make([]types.CompletedPart, 0, expectedTotal)
				for i := 1; i <= expectedTotal; i++ {
					part, ok := partByNumber[int32(i)]
					if !ok || part.ETag == nil {
						writeError(w, http.StatusBadRequest, "upload_incomplete", "multipart upload is missing parts", map[string]any{"path": meta.Path})
						return
					}
					completed = append(completed, types.CompletedPart{
						ETag:       part.ETag,
						PartNumber: part.PartNumber,
					})
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
					writeError(w, http.StatusBadGateway, "upload_failed", "failed to complete multipart upload", map[string]any{"path": meta.Path})
					return
				}
				_ = s.store.DeleteMultipartUpload(r.Context(), profileID, uploadID, meta.Path)
			}
		}

		job, err := s.store.CreateJob(r.Context(), profileID, store.CreateJobInput{
			Type:    jobs.JobTypeTransferDirectUpload,
			Payload: payload,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to create job", nil)
			return
		}

		now := time.Now().UTC().Format(time.RFC3339Nano)
		progress := buildProgress()
		if err := s.store.UpdateJobStatus(r.Context(), job.ID, models.JobStatusSucceeded, &now, &now, progress, nil, nil); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to finalize job", nil)
			return
		}
		if len(indexEntries) > 0 {
			_ = s.store.UpsertObjectIndexBatch(r.Context(), profileID, us.Bucket, indexEntries, now)
		}

		_ = s.store.DeleteMultipartUploadsBySession(r.Context(), profileID, uploadID)
		_, _ = s.store.DeleteUploadSession(r.Context(), profileID, uploadID)
		payload := map[string]any{"status": models.JobStatusSucceeded}
		if progress != nil {
			payload["progress"] = progress
		}
		s.hub.Publish(ws.Event{Type: "job.completed", JobID: job.ID, Payload: payload})
		writeJSON(w, http.StatusCreated, models.JobCreatedResponse{JobID: job.ID})
		return
	}

	if _, ok := jobs.DetectRclone(); !ok {
		writeError(w, http.StatusBadRequest, "transfer_engine_missing", "rclone is required to commit an upload (install it or set RCLONE_PATH)", nil)
		return
	}

	job, err := s.store.CreateJob(r.Context(), profileID, store.CreateJobInput{
		Type:    jobs.JobTypeTransferSyncStagingToS3,
		Payload: payload,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create job", nil)
		return
	}

	if err := s.jobs.Enqueue(job.ID); err != nil {
		finishedAt := time.Now().UTC().Format(time.RFC3339Nano)
		if errors.Is(err, jobs.ErrJobQueueFull) {
			msg := "job queue is full; try again later"
			_ = s.store.UpdateJobStatus(r.Context(), job.ID, models.JobStatusFailed, nil, &finishedAt, nil, &msg, nil)
			job.Status = models.JobStatusFailed
			job.Error = &msg
			job.FinishedAt = &finishedAt
			s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})
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
		msg := "failed to enqueue job"
		_ = s.store.UpdateJobStatus(r.Context(), job.ID, models.JobStatusFailed, nil, &finishedAt, nil, &msg, nil)
		job.Status = models.JobStatusFailed
		job.Error = &msg
		job.FinishedAt = &finishedAt
		s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to enqueue job", nil)
		return
	}

	s.hub.Publish(ws.Event{Type: "job.created", JobID: job.ID, Payload: map[string]any{"job": job}})

	writeJSON(w, http.StatusCreated, models.JobCreatedResponse{JobID: job.ID})
}

const (
	uploadModeStaging   = "staging"
	uploadModeDirect    = "direct"
	uploadModePresigned = "presigned"
	maxCommitItems      = 200
)

func normalizeUploadMode(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	switch raw {
	case uploadModeStaging, uploadModeDirect, uploadModePresigned:
		return raw
	default:
		return ""
	}
}

func flattenSignedHeaders(headers map[string][]string) map[string]string {
	if len(headers) == 0 {
		return nil
	}
	out := make(map[string]string, len(headers))
	for key, values := range headers {
		out[key] = strings.Join(values, ",")
	}
	return out
}

type uploadCommitRequest struct {
	Label          string             `json:"label,omitempty"`
	RootName       string             `json:"rootName,omitempty"`
	RootKind       string             `json:"rootKind,omitempty"`
	TotalFiles     *int               `json:"totalFiles,omitempty"`
	TotalBytes     *int64             `json:"totalBytes,omitempty"`
	Items          []uploadCommitItem `json:"items,omitempty"`
	ItemsTruncated bool               `json:"itemsTruncated,omitempty"`
}

type uploadCommitItem struct {
	Path string `json:"path"`
	Size *int64 `json:"size,omitempty"`
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

	mode := normalizeUploadMode(us.Mode)
	if mode == "" {
		mode = uploadModeStaging
	}
	if mode != uploadModeStaging {
		secrets, ok := profileFromContext(r.Context())
		if ok && rcloneconfig.IsS3LikeProvider(secrets.Provider) {
			if client, err := s3ClientFromProfile(secrets); err == nil {
				if uploads, err := s.store.ListMultipartUploads(r.Context(), profileID, uploadID); err == nil {
					for _, meta := range uploads {
						_ = s.abortMultipartUpload(r.Context(), client, meta)
					}
				}
			}
		}
		_ = s.store.DeleteMultipartUploadsBySession(r.Context(), profileID, uploadID)
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

type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

func writePartToFile(part *multipart.Part, dstPath string, maxBytes int64) (int64, error) {
	defer func() { _ = part.Close() }()

	tmpPath := dstPath + ".tmp"
	// #nosec G304 -- tmpPath is derived from the upload staging directory.
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

func writeReaderToFile(r io.Reader, dstPath string, maxBytes int64) (int64, error) {
	tmpPath := dstPath + ".tmp"
	// #nosec G304 -- tmpPath is derived from the upload staging directory.
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	var reader io.Reader = r
	if maxBytes >= 0 {
		reader = io.LimitReader(r, maxBytes+1)
	}
	buf := make([]byte, 4*1024*1024)
	n, copyErr := io.CopyBuffer(f, reader, buf)
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

func chunkPartName(index int) string {
	return fmt.Sprintf("part-%06d", index)
}

func tryAssembleChunkFile(stagingDir, relOS, chunkDir string, totalChunks int, onDelta func(int64)) error {
	if totalChunks <= 0 {
		return nil
	}
	for i := 0; i < totalChunks; i++ {
		if _, err := os.Stat(filepath.Join(chunkDir, chunkPartName(i))); err != nil {
			return nil
		}
	}

	lockPath := filepath.Join(chunkDir, ".assemble.lock")
	lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil
	}
	_ = lock.Close()
	defer func() { _ = os.Remove(lockPath) }()

	finalPath := filepath.Join(stagingDir, relOS)
	dstDir := filepath.Dir(finalPath)
	if !isUnderDir(stagingDir, dstDir) {
		return fmt.Errorf("invalid upload path")
	}
	if err := os.MkdirAll(dstDir, 0o700); err != nil {
		return err
	}

	tmpPath := finalPath + ".tmp"
	// #nosec G304 -- tmpPath is derived from the upload staging directory.
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	var writtenTotal int64
	for i := 0; i < totalChunks; i++ {
		partPath := filepath.Join(chunkDir, chunkPartName(i))
		info, err := os.Stat(partPath)
		if err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			if onDelta != nil && writtenTotal > 0 {
				onDelta(-writtenTotal)
			}
			return err
		}
		partSize := info.Size()
		part, err := os.Open(partPath)
		if err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			if onDelta != nil && writtenTotal > 0 {
				onDelta(-writtenTotal)
			}
			return err
		}
		copied, err := io.Copy(f, part)
		if copied > 0 {
			writtenTotal += copied
			if onDelta != nil {
				onDelta(copied)
			}
		}
		if err != nil {
			_ = part.Close()
			_ = f.Close()
			_ = os.Remove(tmpPath)
			if onDelta != nil && writtenTotal > 0 {
				onDelta(-writtenTotal)
			}
			return err
		}
		_ = part.Close()
		if err := os.Remove(partPath); err == nil {
			if onDelta != nil && partSize > 0 {
				onDelta(-partSize)
			}
		}
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		if onDelta != nil && writtenTotal > 0 {
			onDelta(-writtenTotal)
		}
		return err
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		if onDelta != nil && writtenTotal > 0 {
			onDelta(-writtenTotal)
		}
		return err
	}
	_ = os.RemoveAll(chunkDir)
	return nil
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

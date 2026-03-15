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
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
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
		writeJSONDecodeError(w, err, 0)
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
		stagingDir, err := store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID)
		if err != nil {
			_, _ = s.store.DeleteUploadSession(r.Context(), profileID, us.ID)
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare staging directory", map[string]any{"error": err.Error()})
			return
		}
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
	stagingDir := ""
	if mode == uploadModeStaging {
		stagingDir, err = store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "upload session has invalid staging directory", map[string]any{"error": err.Error()})
			return
		}
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
		if chunkTotal > maxMultipartUploadParts {
			writeError(w, http.StatusBadRequest, "invalid_request", fmt.Sprintf("multipart upload exceeds %d parts", maxMultipartUploadParts), nil)
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
			s3UploadID, uploadErr := multipartUploadIDFromCreateResponse(resp, err)
			if uploadErr != nil {
				writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
				return
			}
			meta = store.MultipartUpload{
				UploadID:   uploadID,
				ProfileID:  profileID,
				Path:       relPath,
				Bucket:     us.Bucket,
				ObjectKey:  key,
				S3UploadID: s3UploadID,
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

		partNumber, err := multipartPartNumber(chunkIndex + 1)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "invalid part number", map[string]any{"partNumber": chunkIndex + 1})
			return
		}
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
		if err := s.store.UpsertUploadObject(r.Context(), store.UploadObject{
			UploadID:     uploadID,
			ProfileID:    profileID,
			Path:         relPath,
			Bucket:       us.Bucket,
			ObjectKey:    key,
			ExpectedSize: &fileSize,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to persist upload object", nil)
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
			size := counter.n
			if err := s.store.UpsertUploadObject(r.Context(), store.UploadObject{
				UploadID:     uploadID,
				ProfileID:    profileID,
				Path:         relPath,
				Bucket:       us.Bucket,
				ObjectKey:    key,
				ExpectedSize: &size,
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "internal_error", "failed to persist upload object", nil)
				return
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
		chunkDir := filepath.Join(stagingDir, ".chunks", relOS)
		if !isUnderDir(stagingDir, chunkDir) {
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
		if err := tryAssembleChunkFile(stagingDir, relOS, chunkDir, chunkTotal, func(delta int64) error {
			if delta == 0 {
				return nil
			}
			if err := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, delta); err != nil {
				return err
			}
			bytesTracked += delta
			return nil
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
		dstDir := filepath.Join(stagingDir, filepath.Dir(relOS))
		if !isUnderDir(stagingDir, dstDir) {
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
		writeJSONDecodeError(w, err, 0)
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
		partCount, err := expectedMultipartPartCount(fileSize, partSize)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
			return
		}
		if partCount <= 1 {
			writeError(w, http.StatusBadRequest, "invalid_request", "multipart upload requires at least 2 parts", nil)
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
			s3UploadID, uploadErr := multipartUploadIDFromCreateResponse(resp, err)
			if uploadErr != nil {
				writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
				return
			}
			now := time.Now().UTC().Format(time.RFC3339Nano)
			meta = store.MultipartUpload{
				UploadID:   uploadID,
				ProfileID:  profileID,
				Path:       relPath,
				Bucket:     us.Bucket,
				ObjectKey:  key,
				S3UploadID: s3UploadID,
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
		if err := s.store.UpsertUploadObject(r.Context(), store.UploadObject{
			UploadID:     uploadID,
			ProfileID:    profileID,
			Path:         relPath,
			Bucket:       us.Bucket,
			ObjectKey:    key,
			ExpectedSize: &fileSize,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to persist upload object", nil)
			return
		}

		presigner, err := s3PresignClientFromProfile(secrets)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare presigner", nil)
			return
		}
		sort.Ints(partNumbers)
		parts := make([]models.UploadPresignPart, 0, len(partNumbers))
		for _, num := range partNumbers {
			partNumber, err := multipartPartNumber(num)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid_request", "invalid part number", map[string]any{"partNumber": num})
				return
			}
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
	var expectedSize *int64
	if req.Size != nil && *req.Size >= 0 {
		size := *req.Size
		expectedSize = &size
	}
	if err := s.store.UpsertUploadObject(r.Context(), store.UploadObject{
		UploadID:     uploadID,
		ProfileID:    profileID,
		Path:         relPath,
		Bucket:       us.Bucket,
		ObjectKey:    key,
		ExpectedSize: expectedSize,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to persist upload object", nil)
		return
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
	if err := decodeJSONWithOptions(r, &req, jsonDecodeOptions{
		maxBytes:   uploadCommitJSONRequestBodyMaxBytes,
		allowEmpty: true,
	}); err != nil {
		writeJSONDecodeError(w, err, uploadCommitJSONRequestBodyMaxBytes)
		return
	}
	stagingArtifacts := buildUploadCommitArtifacts(uploadID, us, req)

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

		client, uploadErr := s.multipartClientFromContext(r.Context(), "presigned uploads require an S3-compatible provider")
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}
		artifacts, uploadErr := s.prepareImmediateUploadCommit(r.Context(), profileID, uploadID, us, req, client, multipartUploads)
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}

		job, uploadErr := s.finalizeImmediateUploadCommit(
			r.Context(),
			profileID,
			uploadID,
			us,
			artifacts.payload,
			artifacts.progress,
			artifacts.indexEntries,
		)
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}

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
		client, err := s3ClientFromProfile(secrets)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare multipart client", nil)
			return
		}

		multipartUploads, err := s.store.ListMultipartUploads(r.Context(), profileID, uploadID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load multipart uploads", nil)
			return
		}

		if len(multipartUploads) > 0 {
			if err := s.completeDirectMultipartUploads(r.Context(), profileID, client, multipartUploads); err != nil {
				var uploadErr *uploadHTTPError
				if errors.As(err, &uploadErr) {
					writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
					return
				}
				writeError(w, http.StatusInternalServerError, "internal_error", "failed to finalize multipart upload", nil)
				return
			}
		}

		artifacts, uploadErr := s.prepareImmediateUploadCommit(r.Context(), profileID, uploadID, us, req, client, multipartUploads)
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}
		job, uploadErr := s.finalizeImmediateUploadCommit(
			r.Context(),
			profileID,
			uploadID,
			us,
			artifacts.payload,
			artifacts.progress,
			artifacts.indexEntries,
		)
		if uploadErr != nil {
			writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
			return
		}
		writeJSON(w, http.StatusCreated, models.JobCreatedResponse{JobID: job.ID})
		return
	}

	if _, _, err := jobs.EnsureRcloneCompatible(r.Context()); err != nil {
		writeError(w, http.StatusBadRequest, "transfer_engine_missing", "rclone is required to commit an upload (install it or set RCLONE_PATH)", nil)
		return
	}

	job, err := s.store.CreateJob(r.Context(), profileID, store.CreateJobInput{
		Type:    jobs.JobTypeTransferSyncStagingToS3,
		Payload: stagingArtifacts.payload,
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

func multipartUploadIDFromCreateResponse(resp *s3.CreateMultipartUploadOutput, err error) (string, *uploadHTTPError) {
	if err != nil {
		return "", &uploadHTTPError{
			status:  http.StatusBadGateway,
			code:    "upload_failed",
			message: "failed to create multipart upload",
			details: map[string]any{"error": err.Error()},
		}
	}
	if resp == nil || resp.UploadId == nil || strings.TrimSpace(*resp.UploadId) == "" {
		return "", &uploadHTTPError{
			status:  http.StatusBadGateway,
			code:    "upload_failed",
			message: "failed to create multipart upload",
			details: map[string]any{"error": "upstream returned an empty uploadId"},
		}
	}
	return strings.TrimSpace(*resp.UploadId), nil
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

	_ = s.store.DeleteUploadObjectsBySession(r.Context(), profileID, uploadID)
	_, _ = s.store.DeleteUploadSession(r.Context(), profileID, uploadID)
	if us.StagingDir != "" {
		if stagingDir, err := store.ResolveUploadStagingDir(s.cfg.DataDir, us.ID); err == nil {
			_ = os.RemoveAll(stagingDir)
		}
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

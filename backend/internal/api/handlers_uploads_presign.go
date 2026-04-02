package api

import (
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

func (s *server) handlePresignUpload(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := uploadIDFromRequest(r)
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
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil && time.Now().UTC().After(expiresAt) {
		writeError(w, http.StatusBadRequest, "expired", "upload session expired", nil)
		return
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
		s.handleMultipartPresignUpload(w, r, profileID, uploadID, us, req, relPath, key, expires, expiresAt, secrets)
		return
	}

	if req.Size != nil {
		if uploadErr := uploadRejectIfTooLarge(s.cfg.UploadMaxBytes, *req.Size, "upload exceeds maxBytes"); uploadErr != nil {
			uploadWriteError(w, uploadErr)
			return
		}
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

func (s *server) handleMultipartPresignUpload(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID string,
	us store.UploadSession,
	req models.UploadPresignRequest,
	relPath, key string,
	expires time.Duration,
	expiresAt string,
	secrets models.ProfileSecrets,
) {
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
}

package api

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func (s *server) handleDirectMultipartChunkUpload(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID string,
	us store.UploadSession,
	chunkIndexRaw string,
) {
	chunkValues, uploadErr := parseUploadChunkHeaders(r.Header, chunkIndexRaw, true)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	if uploadErr := s.directMultipartChunkFlow(r, profileID, uploadID, us, chunkValues); uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *server) directMultipartState(
	r *http.Request,
	client *s3.Client,
	profileID, uploadID, relPath string,
	us store.UploadSession,
	key string,
	chunkIndex, chunkTotal int,
	fileSize, chunkSize int64,
) (store.MultipartUpload, *uploadHTTPError) {
	meta, found, err := s.store.GetMultipartUpload(r.Context(), profileID, uploadID, relPath)
	if err != nil {
		return store.MultipartUpload{}, newUploadInternalError("failed to load multipart upload", map[string]any{"error": err.Error()})
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if found {
		if meta.FileSize != fileSize || meta.ChunkSize <= 0 {
			if err := s.abortMultipartUpload(r.Context(), client, meta); err != nil {
				return store.MultipartUpload{}, newUploadInternalError("failed to reset multipart upload", map[string]any{"error": err.Error()})
			}
			_ = s.store.DeleteMultipartUpload(r.Context(), profileID, uploadID, relPath)
			found = false
		} else if chunkIndex < chunkTotal-1 {
			if uploadErr := uploadRejectIfChunkMismatch(chunkSize, meta.ChunkSize); uploadErr != nil {
				return store.MultipartUpload{}, uploadErr
			}
		}
	}
	if !found {
		resp, err := client.CreateMultipartUpload(r.Context(), &s3.CreateMultipartUploadInput{
			Bucket: &us.Bucket,
			Key:    &key,
		})
		s3UploadID, uploadErr := multipartUploadIDFromCreateResponse(resp, err)
		if uploadErr != nil {
			return store.MultipartUpload{}, uploadErr
		}
		meta = store.MultipartUpload{
			UploadID:   uploadID,
			ProfileID:  profileID,
			Path:       relPath,
			Bucket:     us.Bucket,
			ObjectKey:  key,
			S3UploadID: s3UploadID,
			ChunkSize:  chunkSize,
			FileSize:   fileSize,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
	} else {
		meta.UpdatedAt = now
	}
	if err := s.store.UpsertMultipartUpload(r.Context(), meta); err != nil {
		return store.MultipartUpload{}, newUploadInternalError("failed to persist multipart upload", map[string]any{"error": err.Error()})
	}
	return meta, nil
}

func (s *server) directMultipartUploadPart(
	r *http.Request,
	client *s3.Client,
	us store.UploadSession,
	key, uploadID string,
	partNumber int32,
	contentLength int64,
) error {
	_, err := client.UploadPart(r.Context(), &s3.UploadPartInput{
		Bucket:        &us.Bucket,
		Key:           &key,
		PartNumber:    &partNumber,
		UploadId:      &uploadID,
		Body:          r.Body,
		ContentLength: &contentLength,
	})
	return err
}

func (s *server) handleDirectMultipartFormUpload(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID string,
	us store.UploadSession,
) {
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
	remainingBytes, uploadErr := uploadRemainingBytes(maxBytes, 0)
	if uploadErr != nil {
		uploadWriteError(w, uploadErr)
		return
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

		used, skippedPart, uploadErr := s.directMultipartFormPart(r, secrets, profileID, uploadID, us, part, &remainingBytes, maxBytes)
		_ = part.Close()
		if uploadErr != nil {
			uploadWriteError(w, uploadErr)
			return
		}
		written += used
		skipped += skippedPart
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

func (s *server) directMultipartFormPart(
	r *http.Request,
	secrets models.ProfileSecrets,
	profileID, uploadID string,
	us store.UploadSession,
	part *multipart.Part,
	remainingBytes *int64,
	maxBytes int64,
) (int, int, *uploadHTTPError) {
	relPath, key, skipped := directMultipartFormPath(us.Prefix, part)
	if skipped {
		return 0, 1, nil
	}
	size, uploadErr := s.directMultipartFormUploadPart(r, secrets, us, key, relPath, part, remainingBytes, maxBytes)
	if uploadErr != nil {
		return 0, 0, uploadErr
	}
	if uploadErr := s.directMultipartFormPersistPart(r, profileID, uploadID, relPath, key, us.Bucket, size); uploadErr != nil {
		return 0, 0, uploadErr
	}
	return 1, 0, nil
}

func directUploadObjectKey(prefix, relPath string) string {
	if prefix == "" {
		return relPath
	}
	return path.Join(prefix, relPath)
}

func directMultipartContentLength(fileSize int64, chunkTotal, chunkIndex int, chunkSize int64) int64 {
	contentLength := chunkSize
	if chunkIndex == chunkTotal-1 {
		remaining := fileSize - (int64(chunkTotal-1) * chunkSize)
		if remaining > 0 && remaining < contentLength {
			contentLength = remaining
		}
	}
	return contentLength
}

package api

import (
	"crypto/rand"
	"encoding/hex"
	"mime/multipart"
	"net/http"
	"path"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/s3client"
	"s3desk/internal/store"
)

func (s *server) handleDirectMultipartChunkUpload(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID string,
	us store.UploadSession,
	chunkIndexRaw string,
) {
	newUploadDirectHTTPService(s).handleDirectMultipartChunkUpload(w, r, profileID, uploadID, us, chunkIndexRaw)
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
	s.multipartStateMu.Lock()
	defer s.multipartStateMu.Unlock()

	meta, found, err := s.store.GetMultipartUpload(r.Context(), profileID, uploadID, relPath)
	if err != nil {
		return store.MultipartUpload{}, newUploadInternalError("failed to load multipart upload", map[string]any{"error": err.Error()})
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	createdMeta := false
	if found {
		if meta.FileSize != fileSize || meta.ChunkSize <= 0 {
			if err := s.rollbackMultipartUpload(r.Context(), client, meta, true); err != nil {
				return store.MultipartUpload{}, newUploadInternalError("failed to reset multipart upload", map[string]any{"error": err.Error()})
			}
			found = false
		} else if chunkIndex < chunkTotal-1 {
			if uploadErr := uploadRejectIfChunkMismatch(chunkSize, meta.ChunkSize); uploadErr != nil {
				return store.MultipartUpload{}, uploadErr
			}
		}
	}
	if !found {
		resp, err := s3client.CreateMultipartUpload(r.Context(), client, us.Bucket, key, "")
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
		createdMeta = true
	} else {
		meta.UpdatedAt = now
	}
	if err := s.store.UpsertMultipartUpload(r.Context(), meta); err != nil {
		details := map[string]any{"error": err.Error()}
		if createdMeta {
			if cleanupErr := s.rollbackMultipartUpload(r.Context(), client, meta, false); cleanupErr != nil {
				details["cleanupError"] = cleanupErr.Error()
			}
		}
		return store.MultipartUpload{}, newUploadInternalError("failed to persist multipart upload", details)
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
	newUploadDirectHTTPService(s).handleDirectMultipartFormUpload(w, r, profileID, uploadID, us)
}

func (s *server) directMultipartFormPart(
	r *http.Request,
	secrets models.ProfileSecrets,
	profileID, uploadID string,
	us store.UploadSession,
	relativePath string,
	part *multipart.Part,
	remainingBytes *int64,
	maxBytes int64,
) (int, int, *uploadHTTPError) {
	relPath, key, skipped := directMultipartFormPath(us.Prefix, relativePath, part)
	if skipped {
		return 0, 1, nil
	}
	tempKey := directUploadTempObjectKey(us.Prefix, uploadID, relPath)
	appendCleanupError := func(uploadErr *uploadHTTPError) {
		if cleanupErr := s.directMultipartFormCleanupTempPart(r, secrets, us, tempKey); cleanupErr != "" {
			if uploadErr.details == nil {
				uploadErr.details = map[string]any{}
			}
			uploadErr.details["cleanupError"] = cleanupErr
		}
	}
	size, uploadErr := s.directMultipartFormUploadPart(r, secrets, us, tempKey, relPath, part, remainingBytes, maxBytes)
	if uploadErr != nil {
		appendCleanupError(uploadErr)
		return 0, 0, uploadErr
	}
	reservation, uploadErr := s.directMultipartFormPersistPart(r, profileID, uploadID, relPath, key, us.Bucket, size)
	if uploadErr != nil {
		appendCleanupError(uploadErr)
		return 0, 0, uploadErr
	}
	if uploadErr := s.directMultipartFormPromoteTempPart(r, secrets, us, tempKey, key, relPath); uploadErr != nil {
		if rollbackErr := s.rollbackUploadObjectByteReservation(r.Context(), reservation); rollbackErr != nil {
			if uploadErr.details == nil {
				uploadErr.details = map[string]any{}
			}
			uploadErr.details["rollbackError"] = rollbackErr.message
		}
		appendCleanupError(uploadErr)
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

func directUploadTempObjectKey(prefix, uploadID, relPath string) string {
	return path.Join(directUploadTempSessionPrefix(prefix, uploadID), randomUploadTempToken(), relPath)
}

func directUploadTempSessionPrefix(prefix, uploadID string) string {
	return directUploadObjectKey(prefix, path.Join(".s3desk-upload-temp", uploadID))
}

func randomUploadTempToken() string {
	var token [8]byte
	if _, err := rand.Read(token[:]); err == nil {
		return hex.EncodeToString(token[:])
	}
	return strconv.FormatInt(time.Now().UTC().UnixNano(), 36)
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

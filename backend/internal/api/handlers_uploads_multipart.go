package api

import (
	"context"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

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
			return nil, uploadMultipartInvalidPartNumberError(part.Number)
		}
		etag := strings.TrimSpace(part.ETag)
		if etag == "" {
			return nil, uploadMultipartInvalidETagError(part.Number)
		}
		etag = strings.Trim(etag, "\"")
		etag = `"` + etag + `"`
		num, err := multipartPartNumber(part.Number)
		if err != nil {
			return nil, uploadMultipartInvalidPartNumberError(part.Number)
		}
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
		return uploadChunkQuery{}, uploadMultipartInvalidPathError()
	}

	query := uploadChunkQuery{path: pathRaw}
	if requireTotal {
		totalRaw := values.Get("total")
		total, uploadErr := uploadParseMultipartPartCount(totalRaw)
		if uploadErr != nil {
			return uploadChunkQuery{}, uploadErr
		}
		query.total = total
	}

	chunkSizeRaw := values.Get("chunkSize")
	chunkSize, err := strconv.ParseInt(chunkSizeRaw, 10, 64)
	if err != nil || chunkSize <= 0 {
		return uploadChunkQuery{}, uploadMultipartInvalidChunkSizeError(chunkSizeRaw)
	}
	query.chunkSize = chunkSize

	fileSizeRaw := values.Get("fileSize")
	fileSize, err := strconv.ParseInt(fileSizeRaw, 10, 64)
	if err != nil || fileSize <= 0 {
		return uploadChunkQuery{}, uploadMultipartInvalidFileSizeError(fileSizeRaw)
	}
	query.fileSize = fileSize

	return query, nil
}

func buildRemoteMultipartChunkState(parts []types.Part, meta store.MultipartUpload) models.UploadChunkState {
	expectedTotal, err := expectedMultipartPartCount(meta.FileSize, meta.ChunkSize)
	if err != nil {
		return models.UploadChunkState{}
	}
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
	newUploadMultipartHTTPService(s).handleCompleteMultipartUpload(w, r)
}

func (s *server) handleAbortMultipartUpload(w http.ResponseWriter, r *http.Request) {
	newUploadMultipartHTTPService(s).handleAbortMultipartUpload(w, r)
}

func (s *server) handleGetUploadChunks(w http.ResponseWriter, r *http.Request) {
	newUploadMultipartHTTPService(s).handleGetUploadChunks(w, r)
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

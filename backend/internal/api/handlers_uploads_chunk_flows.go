package api

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

func (s *server) directMultipartChunkFlow(
	r *http.Request,
	profileID, uploadID string,
	us store.UploadSession,
	chunkValues uploadChunkHeaderValues,
) *uploadHTTPError {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return newUploadInternalError("missing profile secrets", nil)
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return newUploadNotSupportedError("direct streaming multipart uploads require an S3-compatible provider", nil)
	}
	if uploadErr := uploadRejectIfTooLarge(s.cfg.UploadMaxBytes, chunkValues.fileSize, "upload exceeds maxBytes"); uploadErr != nil {
		return uploadErr
	}

	client, err := s3ClientFromProfile(secrets)
	if err != nil {
		return newUploadInternalError("failed to prepare multipart client", map[string]any{"error": err.Error()})
	}
	return s.directMultipartChunkStore(r, client, profileID, uploadID, us, chunkValues)
}

func (s *server) directMultipartChunkStore(
	r *http.Request,
	client *s3.Client,
	profileID, uploadID string,
	us store.UploadSession,
	chunkValues uploadChunkHeaderValues,
) *uploadHTTPError {
	relPath := chunkValues.relPath
	key := directUploadObjectKey(us.Prefix, relPath)

	meta, uploadErr := s.directMultipartState(r, client, profileID, uploadID, relPath, us, key, chunkValues.index, chunkValues.total, chunkValues.fileSize, chunkValues.chunkSize)
	if uploadErr != nil {
		return uploadErr
	}

	partNumber, uploadErr := directMultipartChunkPartNumber(chunkValues.index)
	if uploadErr != nil {
		return uploadErr
	}
	contentLength := directMultipartContentLength(chunkValues.fileSize, chunkValues.total, chunkValues.index, meta.ChunkSize)
	if uploadErr := s.directMultipartChunkUploadPart(r, client, us, key, meta.S3UploadID, partNumber, contentLength); uploadErr != nil {
		return uploadErr
	}
	return s.directMultipartChunkPersist(r, profileID, uploadID, relPath, key, us.Bucket, chunkValues.fileSize)
}

func directMultipartChunkPartNumber(chunkIndex int) (int32, *uploadHTTPError) {
	partNumber, err := multipartPartNumber(chunkIndex + 1)
	if err != nil {
		return 0, newUploadBadRequestError("invalid part number", map[string]any{"partNumber": chunkIndex + 1})
	}
	return partNumber, nil
}

func (s *server) directMultipartChunkUploadPart(
	r *http.Request,
	client *s3.Client,
	us store.UploadSession,
	key, uploadID string,
	partNumber int32,
	contentLength int64,
) *uploadHTTPError {
	if err := s.directMultipartUploadPart(r, client, us, key, uploadID, partNumber, contentLength); err != nil {
		return &uploadHTTPError{
			status:  http.StatusBadGateway,
			code:    "upload_failed",
			message: "failed to upload multipart part",
			details: map[string]any{"error": err.Error()},
		}
	}
	return nil
}

func (s *server) directMultipartChunkPersist(
	r *http.Request,
	profileID, uploadID, relPath, key, bucket string,
	fileSize int64,
) *uploadHTTPError {
	if err := s.store.UpsertUploadObject(r.Context(), store.UploadObject{
		UploadID:     uploadID,
		ProfileID:    profileID,
		Path:         relPath,
		Bucket:       bucket,
		ObjectKey:    key,
		ExpectedSize: &fileSize,
	}); err != nil {
		return newUploadInternalError("failed to persist upload object", map[string]any{"error": err.Error()})
	}
	return nil
}

func (s *server) stagingChunkFlow(
	r *http.Request,
	profileID, uploadID, stagingDir string,
	bytesTracked int64,
	chunkValues uploadChunkHeaderValues,
) *uploadHTTPError {
	relOS, _, chunkPath, prevSize, uploadErr := stagingChunkUploadPaths(stagingDir, chunkValues)
	if uploadErr != nil {
		return uploadErr
	}

	maxBytes := s.cfg.UploadMaxBytes
	remainingBytes, uploadErr := uploadRemainingBytes(maxBytes, bytesTracked)
	if uploadErr != nil {
		return uploadErr
	}
	return s.stagingChunkStore(r, profileID, uploadID, stagingDir, relOS, chunkPath, prevSize, chunkValues, &remainingBytes, maxBytes, bytesTracked)
}

func stagingChunkUploadPaths(
	stagingDir string,
	chunkValues uploadChunkHeaderValues,
) (relOS, chunkDir, chunkPath string, prevSize int64, uploadErr *uploadHTTPError) {
	relOS = filepath.FromSlash(chunkValues.relPath)
	chunkDir = filepath.Join(stagingDir, ".chunks", relOS)
	if !isUnderDir(stagingDir, chunkDir) {
		return "", "", "", 0, newUploadBadRequestError("invalid upload path", map[string]any{"path": chunkValues.relPath})
	}
	if err := os.MkdirAll(chunkDir, 0o700); err != nil {
		return "", "", "", 0, newUploadInternalError("failed to create chunk directory", map[string]any{"error": err.Error()})
	}

	chunkPath = filepath.Join(chunkDir, chunkPartName(chunkValues.index))
	prevSize = fileSizeIfExists(chunkPath)
	return relOS, chunkDir, chunkPath, prevSize, nil
}

func (s *server) stagingChunkStore(
	r *http.Request,
	profileID, uploadID, stagingDir, relOS, chunkPath string,
	prevSize int64,
	chunkValues uploadChunkHeaderValues,
	remainingBytes *int64,
	maxBytes int64,
	bytesTracked int64,
) *uploadHTTPError {
	if uploadErr := s.stagingChunkWrite(r, profileID, uploadID, stagingDir, relOS, chunkValues, chunkPath, prevSize, remainingBytes, maxBytes, bytesTracked); uploadErr != nil {
		return uploadErr
	}
	return nil
}

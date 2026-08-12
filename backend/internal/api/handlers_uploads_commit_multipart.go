package api

import (
	"context"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/logging"
	"s3desk/internal/s3client"
	"s3desk/internal/store"
)

func (s *server) completeDirectMultipartUploads(ctx context.Context, profileID string, client *s3.Client, multipartUploads []store.MultipartUpload) error {
	for _, meta := range multipartUploads {
		if meta.ChunkSize <= 0 || meta.FileSize <= 0 {
			return &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "invalid_request",
				message: "multipart metadata missing size",
				details: map[string]any{"path": meta.Path},
			}
		}

		parts, err := s.listMultipartParts(ctx, client, meta)
		if err != nil {
			return newUploadProviderError("failed to list multipart parts", err, map[string]any{"path": meta.Path})
		}

		expectedTotal, err := expectedMultipartPartCount(meta.FileSize, meta.ChunkSize)
		if err != nil {
			return &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "invalid_request",
				message: "multipart upload has invalid part metadata",
				details: map[string]any{"path": meta.Path, "error": err.Error()},
			}
		}
		completed, err := buildCompletedMultipartParts(parts, expectedTotal)
		if err != nil {
			return &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "upload_incomplete",
				message: "multipart upload is missing parts",
				details: map[string]any{"path": meta.Path},
			}
		}

		err = s3client.CompleteMultipartUpload(ctx, client, meta.Bucket, meta.ObjectKey, meta.S3UploadID, completed)
		if err != nil {
			return newUploadProviderError("failed to complete multipart upload", err, map[string]any{"path": meta.Path})
		}

		if err := s.deleteMultipartUploadMetadataAfterRemote(ctx, profileID, meta.UploadID, meta.Path); err != nil {
			logging.ErrorFields("direct multipart metadata cleanup failed after completion", map[string]any{
				"event":      "upload.direct_multipart_metadata_cleanup_failed",
				"profile_id": profileID,
				"upload_id":  meta.UploadID,
				"path":       meta.Path,
				"error":      err.Error(),
			})
		}
	}

	return nil
}

func buildCompletedMultipartParts(parts []types.Part, expectedTotal int) ([]types.CompletedPart, error) {
	partByNumber := make(map[int32]types.Part, len(parts))
	for _, part := range parts {
		if part.PartNumber == nil {
			continue
		}
		partByNumber[*part.PartNumber] = part
	}
	if len(partByNumber) < expectedTotal {
		return nil, errUploadIncomplete
	}

	completed := make([]types.CompletedPart, 0, expectedTotal)
	for i := 1; i <= expectedTotal; i++ {
		partNumber, err := multipartPartNumber(i)
		if err != nil {
			return nil, err
		}
		part, ok := partByNumber[partNumber]
		if !ok || part.ETag == nil {
			return nil, errUploadIncomplete
		}
		completed = append(completed, types.CompletedPart{
			ETag:       part.ETag,
			PartNumber: part.PartNumber,
		})
	}
	return completed, nil
}

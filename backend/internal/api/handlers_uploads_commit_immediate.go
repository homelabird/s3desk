package api

import (
	"context"
	"errors"
	"net/http"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

func (s *server) executePresignedUploadCommit(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
) (models.JobCreatedResponse, *uploadHTTPError) {
	multipartUploads, err := s.store.ListMultipartUploads(ctx, profileID, uploadID)
	if err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load multipart uploads",
		}
	}
	if len(multipartUploads) > 0 {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "upload_incomplete",
			message: "multipart uploads are not finalized",
		}
	}

	client, uploadErr := s.multipartClientFromContext(ctx, "presigned uploads require an S3-compatible provider")
	if uploadErr != nil {
		return models.JobCreatedResponse{}, uploadErr
	}
	return newUploadCommitExecutionService(s).executeImmediate(ctx, profileID, uploadID, us, req, client, multipartUploads)
}

func (s *server) executeDirectUploadCommit(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
) (models.JobCreatedResponse, *uploadHTTPError) {
	secrets, ok := profileFromContext(ctx)
	if !ok {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "missing profile secrets",
		}
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "not_supported",
			message: "direct streaming multipart uploads require an S3-compatible provider",
		}
	}
	client, err := s3ClientFromProfile(secrets)
	if err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to prepare multipart client",
		}
	}

	multipartUploads, err := s.store.ListMultipartUploads(ctx, profileID, uploadID)
	if err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load multipart uploads",
		}
	}

	if len(multipartUploads) > 0 {
		if err := s.completeDirectMultipartUploads(ctx, profileID, client, multipartUploads); err != nil {
			var uploadErr *uploadHTTPError
			if errors.As(err, &uploadErr) {
				return models.JobCreatedResponse{}, uploadErr
			}
			return models.JobCreatedResponse{}, &uploadHTTPError{
				status:  http.StatusInternalServerError,
				code:    "internal_error",
				message: "failed to finalize multipart upload",
			}
		}
	}
	return newUploadCommitExecutionService(s).executeImmediate(ctx, profileID, uploadID, us, req, client, multipartUploads)
}

package api

import (
	"context"
	"fmt"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
)

func (s *server) deleteMultipartUploadMetadataAfterRemote(ctx context.Context, profileID, uploadID, path string) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), immediateUploadCleanupTimeout)
	defer cancel()
	return s.store.DeleteMultipartUpload(cleanupCtx, profileID, uploadID, path)
}

func (s *server) abortStoredMultipartUploads(ctx context.Context, profileID, uploadID string) error {
	return s.abortStoredMultipartUploadsWithSecrets(ctx, profileID, uploadID, func(ctx context.Context) (models.ProfileSecrets, error) {
		secrets, ok, err := s.store.GetProfileSecrets(ctx, profileID)
		if err != nil {
			return models.ProfileSecrets{}, err
		}
		if !ok {
			return models.ProfileSecrets{}, fmt.Errorf("profile %q not found for multipart cleanup", profileID)
		}
		return secrets, nil
	})
}

func (s *server) abortStoredMultipartUploadsWithSecrets(ctx context.Context, profileID, uploadID string, loadSecrets func(context.Context) (models.ProfileSecrets, error)) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), immediateUploadCleanupTimeout)
	defer cancel()

	uploads, err := s.store.ListMultipartUploads(cleanupCtx, profileID, uploadID)
	if err != nil {
		return err
	}
	if len(uploads) == 0 {
		return nil
	}

	secrets, err := loadSecrets(cleanupCtx)
	if err != nil {
		return err
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return fmt.Errorf("multipart cleanup requires an S3-compatible profile")
	}
	client, err := s3ClientFromProfile(secrets, s.cfg.AllowRemote)
	if err != nil {
		return err
	}

	for _, meta := range uploads {
		if err := s.abortMultipartUpload(cleanupCtx, client, meta); err != nil {
			return fmt.Errorf("abort multipart upload %q/%q: %w", meta.Bucket, meta.ObjectKey, err)
		}
		if err := s.store.DeleteMultipartUpload(cleanupCtx, meta.ProfileID, meta.UploadID, meta.Path); err != nil {
			return fmt.Errorf("delete multipart metadata %q: %w", meta.Path, err)
		}
	}
	return nil
}

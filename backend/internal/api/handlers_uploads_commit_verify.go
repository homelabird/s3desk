package api

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/store"
)

func (s *server) prepareImmediateUploadCommit(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	client *s3.Client,
	multipartUploads []store.MultipartUpload,
) (uploadCommitArtifacts, *uploadHTTPError) {
	return newUploadCommitVerificationService(s).prepareImmediate(ctx, profileID, uploadID, us, req, client, multipartUploads)
}

func (s *server) verifyImmediateUploadTargets(ctx context.Context, client *s3.Client, targets []uploadVerificationTarget) ([]verifiedUploadObject, *uploadHTTPError) {
	return newUploadCommitVerificationService(s).verifyTargets(ctx, client, targets)
}

package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"

	"s3desk/internal/store"
)

type uploadCommitVerificationService struct {
	server *server
}

func newUploadCommitVerificationService(s *server) uploadCommitVerificationService {
	return uploadCommitVerificationService{server: s}
}

func (svc uploadCommitVerificationService) prepareImmediate(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	client *s3.Client,
	multipartUploads []store.MultipartUpload,
) (uploadCommitArtifacts, *uploadHTTPError) {
	plan, uploadErr := svc.buildPlan(ctx, profileID, uploadID, us, req, multipartUploads)
	if uploadErr != nil {
		return uploadCommitArtifacts{}, uploadErr
	}

	verified, uploadErr := svc.verifyTargets(ctx, client, plan.targets)
	if uploadErr != nil {
		return uploadCommitArtifacts{}, uploadErr
	}
	return newUploadCommitArtifactService().buildFromVerified(uploadID, us, req, verified, plan.includeTotals, plan.itemsTruncated), nil
}

func (svc uploadCommitVerificationService) buildPlan(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	multipartUploads []store.MultipartUpload,
) (uploadCommitVerificationPlan, *uploadHTTPError) {
	trackedTargets, uploadErr := svc.loadTrackedTargets(ctx, profileID, uploadID)
	if uploadErr != nil {
		return uploadCommitVerificationPlan{}, uploadErr
	}

	targets := mergeUploadVerificationTargets(
		trackedTargets,
		buildUploadVerificationTargetsFromMultipart(multipartUploads),
	)
	plan := uploadCommitVerificationPlan{
		targets:       targets,
		includeTotals: true,
	}
	if len(plan.targets) == 0 {
		plan.targets = buildUploadVerificationTargetsFromRequest(us, req)
		plan.includeTotals = !req.ItemsTruncated
		plan.itemsTruncated = req.ItemsTruncated
	}
	if len(plan.targets) == 0 {
		return uploadCommitVerificationPlan{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "upload_incomplete",
			message: "no uploaded objects to commit",
		}
	}

	return plan, nil
}

func (svc uploadCommitVerificationService) loadTrackedTargets(
	ctx context.Context,
	profileID, uploadID string,
) ([]uploadVerificationTarget, *uploadHTTPError) {
	trackedObjects, err := svc.server.store.ListUploadObjects(ctx, profileID, uploadID)
	if err != nil {
		return nil, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load upload objects",
		}
	}
	return buildUploadVerificationTargetsFromTracked(trackedObjects), nil
}

func (svc uploadCommitVerificationService) verifyTargets(
	ctx context.Context,
	client *s3.Client,
	targets []uploadVerificationTarget,
) ([]verifiedUploadObject, *uploadHTTPError) {
	verified := make([]verifiedUploadObject, 0, len(targets))
	for _, target := range targets {
		head, err := client.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: &target.Bucket,
			Key:    &target.Key,
		})
		if err != nil {
			if uploadVerifyObjectNotFound(err) {
				return nil, &uploadHTTPError{
					status:  http.StatusBadRequest,
					code:    "upload_incomplete",
					message: "uploaded object not found",
					details: map[string]any{"path": target.Path},
				}
			}
			return nil, &uploadHTTPError{
				status:  http.StatusBadGateway,
				code:    "upload_failed",
				message: "failed to verify uploaded object",
				details: map[string]any{"path": target.Path},
			}
		}

		var actualSize int64
		if head.ContentLength != nil {
			actualSize = *head.ContentLength
		}
		if target.ExpectedSize != nil && *target.ExpectedSize >= 0 && actualSize != *target.ExpectedSize {
			return nil, &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "upload_incomplete",
				message: "uploaded object size mismatch",
				details: map[string]any{
					"path":         target.Path,
					"expectedSize": *target.ExpectedSize,
					"actualSize":   actualSize,
				},
			}
		}

		etag := ""
		if head.ETag != nil {
			etag = strings.TrimSpace(*head.ETag)
		}
		lastModified := ""
		if head.LastModified != nil {
			lastModified = head.LastModified.UTC().Format(time.RFC3339Nano)
		}
		verified = append(verified, verifiedUploadObject{
			Path:         target.Path,
			Key:          target.Key,
			Size:         actualSize,
			ETag:         etag,
			LastModified: lastModified,
		})
	}
	return verified, nil
}

func uploadVerifyObjectNotFound(err error) bool {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	switch strings.TrimSpace(apiErr.ErrorCode()) {
	case "404", "NoSuchKey", "NoSuchObject", "NotFound":
		return true
	default:
		return false
	}
}
